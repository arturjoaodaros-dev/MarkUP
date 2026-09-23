import { describe, expect, it } from 'vitest';
import { DiagnosticBag, LineIndex, parseAttributes } from '@markup-lang/core';

function attrs(text: string) {
  const index = new LineIndex(text);
  const diagnostics = new DiagnosticBag();
  const result = parseAttributes(text, 0, { index, diagnostics, toOffset: (i) => i });
  return {
    ...result,
    codes: diagnostics.items.map((d) => d.code),
    messages: diagnostics.items.map((d) => d.message),
  };
}

describe('attribute blocks', () => {
  it('reads ids, classes, pairs and flags', () => {
    const { attributes, closed, codes } = attrs('{#main .a .b key=value flag other="x y"}');
    expect(closed).toBe(true);
    expect(codes).toEqual([]);
    expect(attributes.id).toBe('main');
    expect(attributes.classes).toEqual(['a', 'b']);
    expect({ ...attributes.values }).toEqual({ key: 'value', flag: true, other: 'x y' });
    expect(attributes.items.map((i) => i.kind)).toEqual([
      'id',
      'class',
      'class',
      'pair',
      'flag',
      'pair',
    ]);
  });

  it('supports single quotes and escapes in quoted values', () => {
    expect({
      ...attrs(`{a='single' b="say \\"hi\\"" c='x\\'y' d="back\\\\slash"}`).attributes.values,
    }).toEqual({
      a: 'single',
      b: 'say "hi"',
      c: "x'y",
      d: 'back\\slash',
    });
  });

  it('accepts commas as separators', () => {
    expect({ ...attrs('{type=bar, title=Hello}').attributes.values }).toEqual({
      type: 'bar',
      title: 'Hello',
    });
  });

  it('allows keys with dashes, colons, dots and underscores', () => {
    expect(Object.keys(attrs('{data-x=1 aria:label=2 a.b=3 _c=4}').attributes.values)).toEqual([
      'data-x',
      'aria:label',
      'a.b',
      '_c',
    ]);
  });

  it('records precise ranges', () => {
    const { attributes } = attrs('{#x key="v"}');
    const pair = attributes.items[1]!;
    expect(pair.range.start.offset).toBe(4);
    expect(pair.nameRange?.start.offset).toBe(4);
    expect(pair.valueRange?.start.offset).toBe(8);
    expect(pair.valueRange?.end.offset).toBe(11);
    expect(attributes.range.end.offset).toBe(12);
  });

  it('reports an unterminated block', () => {
    const result = attrs('{a=1 b=2');
    expect(result.closed).toBe(false);
    expect(result.codes).toEqual(['MU1008']);
    expect({ ...result.attributes.values }).toEqual({ a: '1', b: '2' });
  });

  it('reports an unterminated quoted value', () => {
    expect(attrs('{a="open}').codes).toEqual(['MU1009', 'MU1008']);
  });

  it('reports junk and recovers', () => {
    const result = attrs('{@x key=1}');
    expect(result.codes).toEqual(['MU1009']);
    expect({ ...result.attributes.values }).toEqual({ key: '1' });
  });

  it('reports empty ids, classes and values', () => {
    expect(attrs('{# . a=}').codes).toEqual(['MU1009', 'MU1009', 'MU1009']);
  });

  it('warns about duplicate keys; the last value wins', () => {
    const result = attrs('{a=1 a=2 #x #y}');
    expect(result.codes).toEqual(['MU1010', 'MU1010']);
    expect(result.attributes.values.a).toBe('2');
    expect(result.attributes.id).toBe('y');
  });

  it('is immune to prototype pollution', () => {
    const result = attrs('{__proto__=polluted constructor=x toString=y}');
    expect(Object.getPrototypeOf(result.attributes.values)).toBeNull();
    expect(result.attributes.values.__proto__).toBe('polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps Unicode values', () => {
    expect(attrs('{icon=🚀 label="Olá, mundo"}').attributes.values).toMatchObject({
      icon: '🚀',
      label: 'Olá, mundo',
    });
  });
});
