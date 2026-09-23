import { describe, expect, it } from 'vitest';
import { defineDirective, parse, s, toPlainData, type ContainerDirective } from '@markup-lang/core';
import { codeList, codes, diagnostics, tree } from './helpers.ts';

describe('container directives', () => {
  it('parses name, label, attributes and a flow body', () => {
    expect(tree(':::card[Title]{#c .wide icon=x}\nBody **text**\n:::')).toBe(':::card["Title"]{#c .wide icon=x}(p("Body ", strong("text")))');
  });

  it('parses the example from the brief', () => {
    const source = '# Doc\n\n:::card[Card title]\nCard content\n:::\n\n:::chart\ntype: bar\ndata:\n  Python: 80\n  JavaScript: 60\n  Rust: 40\n:::';
    const result = parse(source);
    expect(result.diagnostics).toEqual([]);
    const chart = result.document.children[2] as ContainerDirective;
    expect(chart.body.kind).toBe('data');
    expect(chart.body.kind === 'data' && toPlainData(chart.body.value)).toEqual({ type: 'bar', data: { Python: 80, JavaScript: 60, Rust: 40 } });
  });

  it('nests with the same number of colons', () => {
    expect(tree(':::note\n:::details[More]\ninner\n:::\nouter\n:::')).toBe(':::note(:::details["More"](p("inner")), p("outer"))');
  });

  it('nests with more colons on the outside', () => {
    expect(tree('::::columns\n:::column\nA\n:::\n:::column\nB\n:::\n::::')).toBe('::::columns(:::column(p("A")), :::column(p("B")))');
  });

  it('allows indentation of fences and content', () => {
    expect(tree('::::tabs\n  :::tab[A]\n  one\n  :::\n::::')).toBe('::::tabs(:::tab["A"](p("one")))');
  });

  it('may appear inside lists and blockquotes and closes at that level', () => {
    expect(tree('- item\n  :::note\n  inside\n  :::\n- next')).toBe('ul(li(p("item"), :::note(p("inside"))), li(p("next")))');
    expect(tree('> :::tip\n> quoted\n> :::')).toBe('quote(:::tip(p("quoted")))');
  });

  it('closes a list that it contains', () => {
    expect(tree(':::note\n- a\n- b\n:::\nafter')).toBe(':::note(ul(li(p("a")), li(p("b")))) p("after")');
  });

  it('interrupts paragraphs with opening and closing fences', () => {
    expect(tree('para\n:::note\ntext\n:::\nmore')).toBe('p("para") :::note(p("text")) p("more")');
  });

  it('treats fenced code as opaque: `:::` inside code is content', () => {
    expect(tree(':::note\n```md\n:::\n:::tip\n```\n:::')).toBe(':::note(pre[md](":::\\n:::tip"))');
  });

  it('accepts an empty body', () => {
    expect(tree(':::note\n:::')).toBe(':::note()');
  });
});

describe('closing fence rules', () => {
  it('prefers the directive whose fence length matches exactly', () => {
    const source = '::::outer\n:::inner\nx\n::::';
    expect(tree(source)).toBe('::::outer(:::inner(p("x")))');
    expect(codes(source).filter((c) => c.startsWith('MU1'))).toEqual(['MU1002 2:1']);
  });

  it('closes the innermost directive when no length matches exactly', () => {
    expect(tree(':::note\ntext\n:::::')).toBe(':::note(p("text"))');
    expect(codeList(':::note\ntext\n:::::')).toEqual([]);
  });

  it('reports a fence that is too short and keeps it as text', () => {
    const source = '::::note\n:::\n::::';
    expect(tree(source)).toBe('::::note(p(":::"))');
    const d = diagnostics(source).find((x) => x.code === 'MU1004')!;
    expect(d.fixes?.[0]?.edits[0]?.newText).toBe('::::');
  });

  it('reports a stray closing fence', () => {
    expect(tree('text\n\n:::')).toBe('p("text") p(":::")');
    expect(codes('text\n\n:::')).toEqual(['MU1003 3:1']);
  });

  it('explains a fence at the wrong nesting level', () => {
    const source = ':::note\n- item\n  :::\n:::';
    const d = diagnostics(source);
    expect(d.map((x) => x.code)).toEqual(['MU1003']);
    expect(d[0]!.related?.[0]?.range.start.line).toBe(1);
    // The misplaced fence is kept as text, continuing the item's paragraph.
    expect(tree(source)).toBe(':::note(ul(li(p("item\\n:::"))))');
  });

  it('reports a directive left open at the end of the document, with a fix', () => {
    const d = diagnostics(':::note\ntext');
    expect(d.map((x) => x.code)).toEqual(['MU1001']);
    expect(d[0]!.fixes?.[0]?.edits[0]).toMatchObject({ newText: '\n:::' });
  });

  it('points at an unclosed code block that swallowed the closing fence', () => {
    const d = diagnostics(':::note\n```\ncode\n:::');
    expect(d.map((x) => x.code).sort()).toEqual(['MU1001', 'MU1011']);
    const unclosed = d.find((x) => x.code === 'MU1001')!;
    expect(unclosed.related?.[0]?.message).toMatch(/code block/);
  });

  it('reports directives closed implicitly by their parent container', () => {
    const source = '> :::note\n> text\n\nafter';
    expect(codes(source)).toEqual(['MU1002 1:3']);
    expect(diagnostics(source)[0]!.message).toMatch(/blockquote/);
  });
});

describe('leaf directives', () => {
  it('parses label and attributes on one line', () => {
    expect(tree('::toc[Contents]{depth=2}')).toBe('::toc["Contents"]{depth=2}');
  });

  it('interrupts paragraphs', () => {
    expect(tree('text\n::toc')).toBe('p("text") ::toc');
  });

  it('requires a name immediately after the colons', () => {
    expect(tree(':: no')).toBe('::no');
    expect(codeList(':: no')).toContain('MU1006');
  });
});

describe('directive header errors', () => {
  it('suggests using trailing text as the label', () => {
    const d = diagnostics(':::card Title here\nx\n:::');
    expect(d.map((x) => x.code)).toEqual(['MU1005']);
    expect(d[0]!.fixes?.[0]?.edits[0]?.newText).toBe('[Title here]');
  });

  it('explains label/attribute order', () => {
    const d = diagnostics(':::card{icon=x}[Title]\nx\n:::');
    expect(d[0]!.code).toBe('MU1005');
    expect(d[0]!.message).toMatch(/before the attributes/);
  });

  it('accepts `::: name` with a warning and a fix', () => {
    expect(tree('::: note\nx\n:::')).toBe(':::note(p("x"))');
    const d = diagnostics('::: note\nx\n:::');
    expect(d.map((x) => x.code)).toEqual(['MU1006']);
    expect(d[0]!.fixes?.[0]?.edits[0]?.newText).toBe('');
  });

  it('reports a missing name', () => {
    expect(codeList(':::{.x}\ntext')).toEqual(['MU1013']);
  });

  it('reports an unterminated label', () => {
    expect(codeList(':::note[oops\nx\n:::')).toEqual(['MU1007']);
  });

  it('reports an unterminated attribute block', () => {
    expect(codeList(':::note{a=1\nx\n:::')).toContain('MU1008');
  });
});

describe('content models', () => {
  it('parses data bodies with MarkUP Data', () => {
    const { document } = parse(':::chart\nlabels: [a, b]\nseries:\n  - name: s\n    values: [1, 2]\n:::');
    const chart = document.children[0] as ContainerDirective;
    expect(chart.body.kind === 'data' && toPlainData(chart.body.value)).toEqual({ labels: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] });
  });

  it('does not treat `:::` lines with a name as closing a data body', () => {
    const source = ':::chart\ndata:\n  a: 1\n:::';
    expect(parse(source).diagnostics).toEqual([]);
  });

  it('keeps raw bodies verbatim, including fences and markup', () => {
    const raw = defineDirective({ name: 'raw-demo', forms: ['container'], description: 'test', content: 'raw' });
    const source = ':::raw-demo\n  **not bold**\n```\n:::inner\n:::';
    const { document, diagnostics } = parse(source, { plugins: [{ name: 't', directives: [raw] }] });
    const node = document.children[0] as ContainerDirective;
    expect(node.body).toMatchObject({ kind: 'raw', value: '  **not bold**\n```\n:::inner' });
    expect(diagnostics).toEqual([]);
  });

  it('strips the fence indentation from raw bodies', () => {
    const raw = defineDirective({ name: 'raw-demo', forms: ['container'], description: 'test', content: 'raw' });
    const { document } = parse('  :::raw-demo\n    a\n  b\n  :::', { plugins: [{ name: 't', directives: [raw] }] });
    expect((document.children[0] as ContainerDirective).body).toMatchObject({ value: '  a\nb' });
  });

  it('parses unknown directives as flow containers', () => {
    expect(tree(':::mystery\n**x**\n:::')).toBe(':::mystery(p(strong("x")))');
  });
});

describe('extensibility', () => {
  it('lets plugins add components with their own content model and schema', () => {
    const youtube = defineDirective({
      name: 'youtube',
      forms: ['leaf'],
      description: 'Embed a video',
      attributes: { id: s.string({ minLength: 11, maxLength: 11 }) },
    });
    const plugin = { name: 'video', directives: [youtube] };
    expect(codeList('::youtube{id=dQw4w9WgXcQ}', { plugins: [plugin] })).toEqual([]);
    expect(codeList('::youtube{id=short}', { plugins: [plugin] })).toEqual(['MU2004']);
    expect(codeList('::youtube', { plugins: [plugin] })).toEqual(['MU2005']);
    expect(codeList('::youtube{id=dQw4w9WgXcQ}')).toEqual(['MU2001']);
  });

  it('lets plugins override built-ins', () => {
    const noteAsData = defineDirective({ name: 'note', forms: ['container'], description: 'x', content: 'data' });
    const { document } = parse(':::note\na: 1\n:::', { plugins: [{ name: 'o', directives: [noteAsData] }] });
    expect((document.children[0] as ContainerDirective).body.kind).toBe('data');
  });
});
