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
});
