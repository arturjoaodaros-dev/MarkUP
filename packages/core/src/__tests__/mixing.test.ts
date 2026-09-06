// Testes de aceitação: MarkUP é Markdown completo + extensões, nunca uma
// substituição. Cada bloco aqui cobre um cenário explicitamente pedido na
// revisão da v0.1.0 — Markdown puro, MarkUP puro, os dois misturados,
// Markdown dentro de diretivas, diretivas entre elementos Markdown,
// diretivas aninhadas, sintaxe inválida e blocos malformados — para que
// nenhuma dessas combinações volte a quebrar silenciosamente.

import { describe, expect, it } from 'vitest';
import { parse } from '../parser';

describe('Markdown puro', () => {
  it('documento inteiro só com construções Markdown, sem nenhuma diretiva', () => {
    const src = [
      '# Título',
      '',
      'Um parágrafo com **negrito**, *itálico*, ~~rasurado~~ e `código`.',
      '',
      '- item',
      '  - sub-item',
      '',
      '1. primeiro',
      '2. segundo',
      '',
      '> uma citação',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '---',
      '',
      '[link](https://example.com) e ![imagem](foto.png)',
    ].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    expect(ast.children.map((c) => c.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'blockquote',
      'table',
      'thematicBreak',
      'paragraph',
    ]);
  });
});

describe('MarkUP puro', () => {
  it('documento só com diretivas, sem Markdown fora delas', () => {
    const src = [':::alert type="info"', 'Aviso.', ':::', '', ':::progress value="50"', ':::'].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    expect(ast.children.map((c) => c.type)).toEqual(['alert', 'progress']);
  });
});

describe('Markdown e MarkUP misturados', () => {
  it('heading, parágrafo com formatação e diretiva no mesmo documento, nesta ordem', () => {
    const src = [
      '# Relatório de vendas',
      '',
      'As vendas cresceram **18%** no último trimestre.',
      '',
      ':::chart type="bar" title="Vendas"',
      'Q1: 120',
      'Q2: 180',
      ':::',
    ].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    expect(ast.children.map((c) => c.type)).toEqual(['heading', 'paragraph', 'chart']);
    const [, paragraph] = ast.children;
    if (paragraph.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(paragraph.children.map((c) => c.type)).toContain('strong');
  });

  it('elementos Markdown antes E depois de uma diretiva, na mesma passada', () => {
    const src = ['Texto antes.', '', ':::alert type="warning"', 'Cuidado.', ':::', '', 'Texto depois.'].join('\n');
    const { ast } = parse(src);
    expect(ast.children.map((c) => c.type)).toEqual(['paragraph', 'alert', 'paragraph']);
  });
});

describe('Markdown dentro de diretivas MarkUP', () => {
  it('alert com negrito, lista e link no corpo', () => {
    const src = [
      ':::alert type="info"',
      'Este alerta contém **Markdown**, incluindo:',
      '',
      '- um item',
      '- outro item',
      '',
      'E um [link](https://example.com).',
      ':::',
    ].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    const alert = ast.children[0];
    if (alert.type !== 'alert') throw new Error('esperado alert');
    expect(alert.children.map((c) => c.type)).toEqual(['paragraph', 'list', 'paragraph']);
    const [firstParagraph] = alert.children;
    if (firstParagraph.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(firstParagraph.children.map((c) => c.type)).toContain('strong');
  });

  it('card: métricas "Rótulo: valor" mais Markdown normal no restante do corpo', () => {
    const src = [':::card title="Performance"', 'CPU: 78%', 'RAM: 64%', '', 'Nota em *itálico*.', ':::'].join('\n');
    const { ast } = parse(src);
    const card = ast.children[0];
    if (card.type !== 'card') throw new Error('esperado card');
    expect(card.metrics).toEqual([
      { label: 'CPU', value: '78%' },
      { label: 'RAM', value: '64%' },
    ]);
    expect(card.children).toMatchObject([{ type: 'paragraph' }]);
  });
});

describe('Diretivas MarkUP entre elementos Markdown', () => {
  it('heading, diretiva, heading, diretiva — alternando livremente', () => {
    const src = [
      '## Resultado',
      '',
      ':::progress value="72" label="Python"',
      ':::',
      '',
      '## Estrutura',
      '',
      ':::card title="Status"',
      'ok: sim',
      ':::',
    ].join('\n');
    const { ast } = parse(src);
    expect(ast.children.map((c) => c.type)).toEqual(['heading', 'progress', 'heading', 'card']);
  });
});

describe('Diretivas aninhadas', () => {
  it('tabs (cerca de 4 dois-pontos) contendo alert (cerca de 3) e Markdown normal', () => {
    const src = [
      '::::tabs',
      '### Aviso',
      'Texto **em negrito** antes do alerta.',
      '',
      ':::alert type="error"',
      'Perigo.',
      ':::',
      '::::',
    ].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    const tabs = ast.children[0];
    if (tabs.type !== 'tabs') throw new Error('esperado tabs');
    expect(tabs.tabs[0].children.map((c) => c.type)).toEqual(['paragraph', 'alert']);
  });
});

describe('Sintaxe inválida não derruba o documento', () => {
  it('diretiva desconhecida vira nó visível, e o resto do documento continua sendo parseado', () => {
    const src = ['# Título', '', ':::timeline', 'algo', ':::', '', 'Depois.'].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(ast.children.map((c) => c.type)).toEqual(['heading', 'unknownDirective', 'paragraph']);
    expect(diagnostics.some((d) => d.code === 'directive-unknown')).toBe(true);
  });

  it('diretiva MarkUP não fechada fecha implicitamente e avisa, sem perder o resto do documento', () => {
    const src = [':::alert type="info"', 'sem fechamento', '', '# Isso ainda deve aparecer'].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics.some((d) => d.code === 'directive-unclosed')).toBe(true);
    // A diretiva não fechada consome até o fim do documento (não há um
    // ":::" para delimitá-la), então o heading final vira parte do corpo
    // dela — comportamento esperado, e ainda assim sem exceção nem perda
    // silenciosa de conteúdo.
    const alert = ast.children[0];
    expect(alert.type).toBe('alert');
  });

  it('bloco de código sem fechamento avisa mas não quebra o parse', () => {
    const { ast, diagnostics } = parse('```python\nprint(1)');
    expect(ast.children).toMatchObject([{ type: 'codeBlock', lang: 'python' }]);
    expect(diagnostics.some((d) => d.code === 'code-fence-unclosed')).toBe(true);
  });

  it('atributo com valor inválido cai para o padrão e avisa, sem quebrar a diretiva', () => {
    const { ast, diagnostics } = parse([':::alert type="oops"', 'Texto.', ':::'].join('\n'));
    expect(ast.children[0]).toMatchObject({ type: 'alert', level: 'info' });
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'alert-invalid-type' });
  });

  it('atributo obrigatório ausente vira erro, mas o documento continua parseável', () => {
    const { ast, diagnostics } = parse(':::progress label="sem valor"\n:::');
    expect(ast.children[0]).toMatchObject({ type: 'progress', value: 0 });
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'progress-missing-value' });
  });
});

describe('Documento de aceitação completo (Markdown + MarkUP no mesmo arquivo)', () => {
  it('mistura tudo — headings, listas, tabela, links, e as sete diretivas — sem um destruir o outro', () => {
    const src = [
      '# Relatório de vendas',
      '',
      '## Resultado',
      '',
      'As vendas cresceram **18%**, puxadas por `Q4`.',
      '',
      ':::chart type="bar" title="Vendas por trimestre"',
      'Q1: 120',
      'Q2: 180',
      ':::',
      '',
      ':::card title="Performance"',
      'CPU: 78%',
      'RAM: 64%',
      ':::',
      '',
      ':::alert type="warning"',
      'Esta operação pode apagar dados.',
      ':::',
      '',
      '## Progresso da equipe',
      '',
      ':::progress value="72" label="Python"',
      ':::',
      '',
      ':::math',
      'E = mc^2',
      ':::',
      '',
      '::::tabs',
      '### Python',
      '```python',
      'print("hello")',
      '```',
      '### JavaScript',
      '```javascript',
      'console.log("hello")',
      '```',
      '::::',
      '',
      '| Recurso | Suportado |',
      '|---|---|',
      '| Tabelas | sim |',
      '',
      'Veja o [projeto](https://example.com) para mais detalhes.',
    ].join('\n');

    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    expect(ast.children.map((c) => c.type)).toEqual([
      'heading',
      'heading',
      'paragraph',
      'chart',
      'card',
      'alert',
      'heading',
      'progress',
      'math',
      'tabs',
      'table',
      'paragraph',
    ]);
  });
});
