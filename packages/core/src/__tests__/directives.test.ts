import { describe, expect, it } from 'vitest';
import { parse } from '../parser';

describe('Diretivas MarkUP', () => {
  it('chart de barras com série', () => {
    const { ast, diagnostics } = parse(
      [':::chart type="bar" title="Vendas por trimestre"', 'Q1: 120', 'Q2: 180', 'Q3: 240', ':::'].join('\n'),
    );
    expect(diagnostics).toHaveLength(0);
    expect(ast.children[0]).toMatchObject({
      type: 'chart',
      chartType: 'bar',
      title: 'Vendas por trimestre',
      series: [
        { label: 'Q1', value: 120 },
        { label: 'Q2', value: 180 },
        { label: 'Q3', value: 240 },
      ],
    });
  });

  it('chart com tipo inválido cai para bar e emite aviso', () => {
    const { ast, diagnostics } = parse([':::chart type="pizza"', 'Q1: 1', ':::'].join('\n'));
    expect(ast.children[0]).toMatchObject({ type: 'chart', chartType: 'bar' });
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'chart-invalid-type' });
  });

  it('card com métricas e corpo markdown', () => {
    const { ast } = parse(
      [':::card title="Performance"', 'CPU: 78%', 'RAM: 64%', '', 'Texto adicional.', ':::'].join('\n'),
    );
    expect(ast.children[0]).toMatchObject({
      type: 'card',
      title: 'Performance',
      metrics: [
        { label: 'CPU', value: '78%' },
        { label: 'RAM', value: '64%' },
      ],
      children: [{ type: 'paragraph' }],
    });
  });

  it('alert com nível e conteúdo', () => {
    const { ast } = parse([':::alert type="warning"', 'Esta operação pode apagar dados.', ':::'].join('\n'));
    expect(ast.children[0]).toMatchObject({ type: 'alert', level: 'warning' });
  });

  it('progress de linha única', () => {
    const { ast, diagnostics } = parse(':::progress value="72" label="Python"\n:::');
    expect(diagnostics).toHaveLength(0);
    expect(ast.children[0]).toMatchObject({ type: 'progress', value: 72, max: 100, label: 'Python' });
  });

  it('progress sem value emite erro e usa 0', () => {
    const { ast, diagnostics } = parse(':::progress label="Sem valor"\n:::');
    expect(ast.children[0]).toMatchObject({ type: 'progress', value: 0 });
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'progress-missing-value' });
  });

  it('math preserva a expressão bruta', () => {
    const { ast } = parse([':::math', 'E = mc^2', ':::'].join('\n'));
    expect(ast.children[0]).toMatchObject({ type: 'math', value: 'E = mc^2' });
  });

  it('code normaliza para codeBlock', () => {
    const { ast } = parse([':::code language="python"', 'def hello():', '    print("Hello World")', ':::'].join('\n'));
    expect(ast.children[0]).toMatchObject({ type: 'codeBlock', lang: 'python' });
  });

  it('tabs divide o corpo por headings de nível 3', () => {
    const src = [
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
    ].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    expect(ast.children[0]).toMatchObject({
      type: 'tabs',
      tabs: [
        { title: 'Python', children: [{ type: 'codeBlock', lang: 'python' }] },
        { title: 'JavaScript', children: [{ type: 'codeBlock', lang: 'javascript' }] },
      ],
    });
  });

  it('diretivas aninhadas: tabs com cerca maior contendo alert com cerca menor', () => {
    const src = ['::::tabs', '### Aviso', ':::alert type="error"', 'Perigo.', ':::', '::::'].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(0);
    expect(ast.children[0]).toMatchObject({
      type: 'tabs',
      tabs: [{ title: 'Aviso', children: [{ type: 'alert', level: 'error' }] }],
    });
  });

  it('diretiva desconhecida vira unknownDirective com aviso', () => {
    const { ast, diagnostics } = parse([':::timeline', 'algo', ':::'].join('\n'));
    expect(ast.children[0]).toMatchObject({ type: 'unknownDirective', name: 'timeline' });
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'directive-unknown' });
  });

  it('diretiva não fechada fecha implicitamente no EOF com aviso', () => {
    const { ast, diagnostics } = parse([':::alert type="info"', 'sem fechamento'].join('\n'));
    expect(ast.children[0]).toMatchObject({ type: 'alert', level: 'info' });
    expect(diagnostics.some((d) => d.code === 'directive-unclosed')).toBe(true);
  });
});
