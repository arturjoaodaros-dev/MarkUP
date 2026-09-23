import { describe, expect, it } from 'vitest';
import { DiagnosticBag, LineIndex, parseData, toPlainData, type DataNode } from '@markup-lang/core';

function data(source: string): {
  value: unknown;
  node: DataNode | null;
  codes: string[];
  messages: string[];
} {
  const index = new LineIndex(source);
  const diagnostics = new DiagnosticBag();
  let offset = 0;
  const lines = source.split('\n').map((text) => {
    const line = { text, offset };
    offset += text.length + 1;
    return line;
  });
  const node = parseData(lines, index, diagnostics);
  return {
    value: toPlainData(node),
    node,
    codes: diagnostics.items.map((d) => `${d.code} ${d.range.start.line}:${d.range.start.column}`),
    messages: diagnostics.items.map((d) => d.message),
  };
}

describe('MarkUP Data: scalars', () => {
  it('resolves plain scalars', () => {
    expect(
      data('a: 1\nb: -2.5e3\nc: true\nd: FALSE\ne: null\nf: ~\ng: hello world\nh:').value,
    ).toEqual({
      a: 1,
      b: -2500,
      c: true,
      d: false,
      e: null,
      f: null,
      g: 'hello world',
      h: null,
    });
  });

  it('keeps numbers with leading zeros as strings', () => {
    expect(data('zip: 01234\nzero: 0\nfrac: 0.5').value).toEqual({
      zip: '01234',
      zero: 0,
      frac: 0.5,
    });
  });

  it('does not treat yes/no/on/off as booleans', () => {
    expect(data('a: yes\nb: no\nc: on').value).toEqual({ a: 'yes', b: 'no', c: 'on' });
  });

  it('parses quoted strings with escapes', () => {
    expect(data(`a: "line\\nnext \\"q\\" \\u00e9"\nb: 'it''s'`).value).toEqual({
      a: 'line\nnext "q" é',
      b: "it's",
    });
  });

  it('strips comments but not hashes inside values', () => {
    expect(data('# heading comment\na: 1 # trailing\nb: C#\nc: "x # y"').value).toEqual({
      a: 1,
      b: 'C#',
      c: 'x # y',
    });
  });

  it('allows colons inside plain values', () => {
    expect(data('url: https://example.com:8080/a\ntime: 10:30').value).toEqual({
      url: 'https://example.com:8080/a',
      time: '10:30',
    });
  });

  it('parses literal blocks', () => {
    expect(data('text: |\n  line 1\n    indented\n\n  line 3\nnext: x').value).toEqual({
      text: 'line 1\n  indented\n\nline 3\n',
      next: 'x',
    });
    expect(data('text: |-\n  a\n  b').value).toEqual({ text: 'a\nb' });
  });
});

describe('MarkUP Data: collections', () => {
  it('nests mappings by indentation', () => {
    expect(data('a:\n  b:\n    c: 1\n  d: 2\ne: 3').value).toEqual({
      a: { b: { c: 1 }, d: 2 },
      e: 3,
    });
  });

  it('parses block sequences, including compact ones under a key', () => {
    expect(data('- a\n- 2\n- true').value).toEqual(['a', 2, true]);
    expect(data('list:\n- a\n- b\nnext: 1').value).toEqual({ list: ['a', 'b'], next: 1 });
    expect(data('list:\n  - a\n  - b').value).toEqual({ list: ['a', 'b'] });
  });

  it('parses sequences of mappings', () => {
    expect(data('- name: a\n  value: 1\n- name: b\n  value: 2').value).toEqual([
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
    ]);
  });

  it('parses nested sequences', () => {
    expect(data('- - a\n  - b\n- - c').value).toEqual([['a', 'b'], ['c']]);
  });

  it('parses flow sequences', () => {
    expect(data('a: [1, two, "three, 3", [4, 5], []]').value).toEqual({
      a: [1, 'two', 'three, 3', [4, 5], []],
    });
    expect(data('a: [1, 2,]').value).toEqual({ a: [1, 2] });
  });

  it('parses quoted keys', () => {
    expect(data('"a b": 1\n\'c:d\': 2').value).toEqual({ 'a b': 1, 'c:d': 2 });
  });

  it('returns null for empty input', () => {
    expect(data('').node).toBeNull();
    expect(data('# only a comment\n\n').node).toBeNull();
  });

  it('records positions for keys and values', () => {
    const { node } = data('a: 1\nlist:\n  - x');
    expect(node?.kind).toBe('map');
    if (node?.kind !== 'map') return;
    const list = node.entries[1]!;
    expect(list.keyRange.start).toMatchObject({ line: 2, column: 1 });
    expect(list.value.range.start).toMatchObject({ line: 3, column: 3 });
  });
});

describe('MarkUP Data: errors', () => {
  it('reports duplicate keys and keeps the first', () => {
    const result = data('a: 1\na: 2');
    expect(result.codes).toEqual(['MU1502 2:1']);
    expect(result.value).toEqual({ a: 1 });
  });

  it('reports tabs in indentation', () => {
    expect(data('a:\n\tb: 1').codes).toEqual(['MU1503 2:1']);
  });

  it('reports unterminated strings', () => {
    expect(data('a: "open').codes).toEqual(['MU1504 1:4']);
    expect(data("a: 'open").codes).toEqual(['MU1504 1:4']);
  });

  it('reports unterminated flow sequences', () => {
    expect(data('a: [1, 2').codes).toEqual(['MU1501 1:4']);
  });

  it('reports unsupported syntax', () => {
    expect(data('a: {b: 1}').messages[0]).toMatch(/Flow mappings/);
    expect(data('a: >\n  folded').messages[0]).toMatch(/Folded/);
  });

  it('reports unexpected indentation and junk', () => {
    expect(data('a: 1\n    b: 2').codes).toEqual(['MU1501 2:5']);
    expect(data('a: "x" junk').codes).toEqual(['MU1501 1:8']);
    expect(data('just text\nmore').codes).toEqual(['MU1501 2:1']);
  });

  it('reports a missing key in a mapping', () => {
    expect(data('a: 1\nnot a pair').codes).toEqual(['MU1501 2:1']);
  });

  it('never throws on deeply nested input', () => {
    const deep = Array.from({ length: 300 }, (_, i) => `${' '.repeat(i * 2)}k${i}:`).join('\n');
    expect(() => data(deep)).not.toThrow();
    expect(data(deep).messages.some((m) => /nested/.test(m))).toBe(true);
    expect(() => data(`a: ${'['.repeat(500)}`)).not.toThrow();
  });
});
