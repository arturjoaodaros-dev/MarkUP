import { describe, expect, it } from 'vitest';
import {
  DiagnosticBag,
  LineIndex,
  closest,
  coerceAttribute,
  describeType,
  editDistance,
  parseData,
  s,
  validateData,
} from '@markup-lang/core';

function check(source: string, schema: Parameters<typeof validateData>[1]): string[] {
  const index = new LineIndex(source);
  let offset = 0;
  const lines = source.split('\n').map((text) => {
    const line = { text, offset };
    offset += text.length + 1;
    return line;
  });
  const node = parseData(lines, index, new DiagnosticBag());
  return validateData(node, schema).map((i) => i.message);
}

describe('validateData', () => {
  const schema = s.object({
    name: s.string({ minLength: 1 }),
    count: s.number({ integer: true, min: 0, optional: true }),
    tags: s.array(s.string(), { optional: true, maxItems: 2 }),
    mode: s.enum(['a', 'b'], { default: 'a' }),
    extra: s.record(s.number(), { optional: true }),
  });

  it('accepts valid data', () => {
    expect(check('name: x\ncount: 3\ntags: [a, b]\nmode: b\nextra:\n  k: 1', schema)).toEqual([]);
  });

  it('reports each problem with a path', () => {
    expect(check('name: ""\ncount: -1\ntags: [a, b, c]\nmode: c\nextra:\n  k: no\nunknown: 1', schema)).toEqual([
      'name: Expected a non-empty string.',
      'count: Expected a number ≥ 0, found -1.',
      'tags: Expected at most 2 items, found 3.',
      'mode: Expected one of `a`, `b`, found the string "c".',
      'extra.k: Expected a number, found the string "no".',
      'Unknown key `unknown`.',
    ]);
  });

  it('reports missing required keys', () => {
    expect(check('count: 1', schema)).toEqual(['Missing required key `name`.']);
  });

  it('suggests close keys', () => {
    expect(check('name: x\ncuont: 1', schema)).toEqual(['Unknown key `cuont` — did you mean `count`?']);
  });

  it('accepts plain numbers and booleans where strings are expected', () => {
    expect(check('name: 2026', schema)).toEqual([]);
    expect(check('name: "2026"', schema)).toEqual([]);
  });

  it('reports the closest union option', () => {
    const union = s.union([s.array(s.number()), s.record(s.number())]);
    expect(check('- 1\n- x', union)).toEqual(['[1]: Expected a number, found the string "x".']);
    expect(check('a: x', union)).toEqual(['a: Expected a number, found the string "x".']);
    expect(check('plain', union)).toEqual(['Expected number[] | map of number, found the string "plain".']);
  });
});

describe('coerceAttribute', () => {
  it('coerces numbers, booleans and enums', () => {
    expect(coerceAttribute('42', s.number())).toEqual({ ok: true, value: 42 });
    expect(coerceAttribute(' 1.5 ', s.number())).toEqual({ ok: true, value: 1.5 });
    expect(coerceAttribute(true, s.boolean())).toEqual({ ok: true, value: true });
    expect(coerceAttribute('false', s.boolean())).toEqual({ ok: true, value: false });
    expect(coerceAttribute('b', s.enum(['a', 'b']))).toEqual({ ok: true, value: 'b' });
  });

  it('explains failures', () => {
    expect(coerceAttribute('x', s.number())).toMatchObject({ ok: false, message: 'Expected a number, found `x`.' });
    expect(coerceAttribute('', s.number())).toMatchObject({ ok: false });
    expect(coerceAttribute(true, s.string())).toMatchObject({ ok: false });
    expect(coerceAttribute('7', s.number({ max: 5 }))).toMatchObject({ ok: false, message: 'Expected a number ≤ 5, found 7.' });
    expect(coerceAttribute('bb', s.enum(['aa', 'bx']))).toMatchObject({ ok: false });
  });
});

describe('describeType', () => {
  it('renders compact type labels', () => {
    expect(describeType(s.number({ min: 0, max: 100 }))).toBe('number (0–100)');
    expect(describeType(s.number({ integer: true, min: 1 }))).toBe('integer (≥ 1)');
    expect(describeType(s.enum(['a', 'b']))).toBe('"a" | "b"');
    expect(describeType(s.array(s.union([s.string(), s.number()])))).toBe('(string | number)[]');
  });
});

describe('suggestions', () => {
  it('counts transpositions as one edit', () => {
    expect(editDistance('kdb', 'kbd')).toBe(1);
    expect(editDistance('note', 'note')).toBe(0);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });

  it('finds the closest candidate within a sensible distance', () => {
    expect(closest('warnign', ['note', 'warning', 'tip'])).toBe('warning');
    expect(closest('Card', ['card'])).toBe('card');
    expect(closest('zzz', ['note', 'tip'])).toBeNull();
  });
});
