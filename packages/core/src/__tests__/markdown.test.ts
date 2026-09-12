import { describe, expect, it } from 'vitest';
import { parse } from '../parser';

describe('Markdown básico', () => {
  it('headings de nível 1 a 6', () => {
    const { ast, diagnostics } = parse('# H1\n## H2\n###### H6');
    expect(diagnostics).toHaveLength(0);
    expect(ast.children).toMatchObject([
      { type: 'heading', depth: 1 },
      { type: 'heading', depth: 2 },
      { type: 'heading', depth: 6 },
    ]);
  });

  it('parágrafo com negrito, itálico e código inline', () => {
    const { ast } = parse('As vendas cresceram **18%** no `Q3`, e foi *ótimo*.');
    const [p] = ast.children;
    expect(p.type).toBe('paragraph');
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children.map((c) => c.type)).toEqual(['text', 'strong', 'text', 'inlineCode', 'text', 'emphasis', 'text']);
  });

  it('link e imagem', () => {
    const { ast } = parse('[MarkUP](https://example.com "título") e ![alt](img.png)');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    const link = p.children.find((c) => c.type === 'link');
    const image = p.children.find((c) => c.type === 'image');
    expect(link).toMatchObject({ url: 'https://example.com', title: 'título' });
    expect(image).toMatchObject({ url: 'img.png', alt: 'alt' });
  });

  it('wikilink simples', () => {
    const { ast, diagnostics } = parse('Veja [[Guia de Instalação]] para mais.');
    expect(diagnostics).toHaveLength(0);
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    const link = p.children.find((c) => c.type === 'wikilink');
    expect(link).toMatchObject({ target: 'Guia de Instalação', alias: undefined });
  });

  it('wikilink com alias', () => {
    const { ast } = parse('[[Guia de Instalação|clique aqui]]');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children[0]).toMatchObject({ type: 'wikilink', target: 'Guia de Instalação', alias: 'clique aqui' });
  });

  it('wikilink não fechado vira texto literal', () => {
    const { ast } = parse('[[sem fechar');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children).toMatchObject([{ type: 'text', value: '[[sem fechar' }]);
  });

  it('wikilink não interfere com link markdown comum', () => {
    const { ast } = parse('[MarkUP](https://example.com) e [[Outra Página]]');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children.map((c) => c.type)).toContain('link');
    expect(p.children.map((c) => c.type)).toContain('wikilink');
  });

  it('posição do wikilink cobre os colchetes inteiros', () => {
    const { ast } = parse('[[Alvo]]');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    const [link] = p.children;
    expect(link.position.start.offset).toBe(0);
    expect(link.position.end.offset).toBe('[[Alvo]]'.length);
  });

  it('lista não ordenada e ordenada', () => {
    const { ast } = parse('- um\n- dois\n\n1. primeiro\n2. segundo');
    expect(ast.children).toMatchObject([
      { type: 'list', ordered: false },
      { type: 'list', ordered: true, start: 1 },
    ]);
  });

  it('blockquote', () => {
    const { ast } = parse('> uma citação\n> continua aqui');
    expect(ast.children[0]).toMatchObject({ type: 'blockquote' });
  });

  it('bloco de código com linguagem', () => {
    const { ast } = parse('```python\nprint("oi")\n```');
    expect(ast.children[0]).toMatchObject({ type: 'codeBlock', lang: 'python', value: 'print("oi")' });
  });

  it('tabela com alinhamento', () => {
    const { ast } = parse('| A | B |\n|:--|--:|\n| 1 | 2 |');
    expect(ast.children[0]).toMatchObject({
      type: 'table',
      align: ['left', 'right'],
      rows: [{ type: 'tableRow' }],
    });
  });

  it('régua horizontal', () => {
    const { ast } = parse('texto\n\n---\n\nmais texto');
    expect(ast.children.map((c) => c.type)).toEqual(['paragraph', 'thematicBreak', 'paragraph']);
  });

  it('nunca lança exceção em entrada vazia ou estranha', () => {
    expect(() => parse('')).not.toThrow();
    expect(() => parse(':::\n:::')).not.toThrow();
    expect(() => parse('```\nsem fechamento')).not.toThrow();
  });

  it('strikethrough', () => {
    const { ast } = parse('Isso está ~~errado~~.');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children.map((c) => c.type)).toEqual(['text', 'strikethrough', 'text']);
    const st = p.children[1];
    if (st.type !== 'strikethrough') throw new Error('esperado strikethrough');
    expect(st.children).toMatchObject([{ type: 'text', value: 'errado' }]);
  });

  it('lista não ordenada aninhada dentro de um item', () => {
    const { ast } = parse(['- item um', '  - sub um', '  - sub dois', '- item dois'].join('\n'));
    expect(ast.children).toMatchObject([{ type: 'list', ordered: false }]);
    const outer = ast.children[0];
    if (outer.type !== 'list') throw new Error('esperado list');
    expect(outer.items).toHaveLength(2);
    // O primeiro item contém um parágrafo ("item um") e uma sub-lista aninhada.
    expect(outer.items[0].children.map((c) => c.type)).toEqual(['paragraph', 'list']);
    const nested = outer.items[0].children[1];
    if (nested.type !== 'list') throw new Error('esperado list aninhada');
    expect(nested.items).toHaveLength(2);
    expect(outer.items[1].children).toMatchObject([{ type: 'paragraph' }]);
  });

  it('lista ordenada aninhada, alinhada à largura do marcador do pai', () => {
    const { ast } = parse(['1. primeiro', '   1. sub 1.1', '   2. sub 1.2', '2. segundo'].join('\n'));
    const outer = ast.children[0];
    if (outer.type !== 'list') throw new Error('esperado list');
    expect(outer.items[0].children.map((c) => c.type)).toEqual(['paragraph', 'list']);
    const nested = outer.items[0].children[1];
    if (nested.type !== 'list') throw new Error('esperado list aninhada');
    expect(nested).toMatchObject({ ordered: true, start: 1 });
    expect(nested.items).toHaveLength(2);
  });

  it('quebra de linha rígida (duas espaços no fim da linha) vira nó break', () => {
    const { ast } = parse('linha um  \nlinha dois');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children.map((c) => c.type)).toEqual(['text', 'break', 'text']);
  });

  it('quebra de linha rígida com barra invertida solta no fim da linha', () => {
    const { ast } = parse('linha um\\\nlinha dois');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children.map((c) => c.type)).toEqual(['text', 'break', 'text']);
  });

  it('quebra de linha suave (uma linha normal) vira só um espaço, não um break', () => {
    const { ast } = parse('linha um\nlinha dois');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    expect(p.children.map((c) => c.type)).toEqual(['text']);
    expect(p.children[0]).toMatchObject({ value: 'linha um linha dois' });
  });

  it('escapa pontuação ampla do CommonMark, não só a sintaxe do MarkUP', () => {
    const { ast } = parse('\\~ \\" \\@ \\%');
    const [p] = ast.children;
    if (p.type !== 'paragraph') throw new Error('esperado paragraph');
    const text = p.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
    expect(text).toBe('~ " @ %');
  });

  it('"#texto" sem espaço não vira heading (exigência do CommonMark) e emite aviso explicando por quê', () => {
    const { ast, diagnostics } = parse('#semespaco');
    expect(ast.children).toMatchObject([{ type: 'paragraph' }]);
    expect(diagnostics).toMatchObject([{ severity: 'warning', code: 'heading-missing-space' }]);
  });

  it('"#" seguido de espaço sempre vira heading, mesmo com só um "#"', () => {
    const { diagnostics } = parse('# título válido');
    expect(diagnostics).toHaveLength(0);
  });

  it('heading ATX vazio ("######" sozinho) é válido e não dispara o aviso', () => {
    const { ast, diagnostics } = parse('######');
    expect(ast.children).toMatchObject([{ type: 'heading', depth: 6 }]);
    expect(diagnostics).toHaveLength(0);
  });
});
