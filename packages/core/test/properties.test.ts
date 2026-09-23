/**
 * Property-based tests: the parser must hold its invariants for *any* input.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from '@markup-lang/core';
import { checkInvariants, shape } from './invariants.ts';

/** Fragments that exercise every construct, including broken ones. */
const FRAGMENTS = [
  '# ',
  '## ',
  '###### ',
  '> ',
  '>',
  '- ',
  '* ',
  '+ ',
  '1. ',
  '2) ',
  '- [ ] ',
  '- [x] ',
  '```',
  '~~~',
  '```ts',
  ':::',
  '::::',
  ':::note',
  ':::note[T]',
  '::::tabs',
  ':::tab[A]',
  ':::chart',
  ':::unknown',
  '::toc',
  '::progress{value=5}',
  ':badge[b]{variant=info}',
  ':kbd[K]',
  ':x[',
  ':y{',
  '::: spaced',
  '*',
  '**',
  '_',
  '__',
  '~~',
  '`',
  '``',
  '[',
  ']',
  '(',
  ')',
  '![',
  '{',
  '}',
  '#',
  '.',
  '=',
  '"',
  "'",
  '[a](b)',
  '[ref]',
  '[ref]: /u',
  '[^1]',
  '[^1]: note',
  '<!--',
  '-->',
  '<https://x.y>',
  'https://a.b/c',
  '|',
  '| a | b |',
  '|---|---|',
  '---',
  '***',
  '===',
  '\\',
  '&amp;',
  '&#65;',
  '&bogus;',
  'text',
  'word',
  ' ',
  '  ',
  '\t',
  'é',
  '😀',
  '\u0000',
  'type: bar',
  'data:',
  '  a: 1',
  'labels: [a',
  '- name: s',
];

const line = fc
  .array(fc.constantFrom(...FRAGMENTS), { maxLength: 8 })
  .map((parts) => parts.join(''));
const indent = fc.constantFrom('', ' ', '  ', '    ', '\t');
const eol = fc.constantFrom('\n', '\r\n', '\r');
const markupDocument = fc
  .array(fc.tuple(indent, line, eol), { maxLength: 40 })
  .map((lines) => lines.map(([i, l, e]) => i + l + e).join(''));

describe('parser properties', () => {
  it('never throws and always satisfies the invariants (random strings)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300, unit: 'grapheme-composite' }), (source) => {
        expect(checkInvariants(source)).toEqual([]);
      }),
      { numRuns: 400 },
    );
  });

  it('never throws and always satisfies the invariants (grammar-biased documents)', () => {
    fc.assert(
      fc.property(markupDocument, (source) => {
        expect(checkInvariants(source)).toEqual([]);
      }),
      { numRuns: 600 },
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(markupDocument, (source) => {
        expect(JSON.stringify(parse(source))).toBe(JSON.stringify(parse(source)));
      }),
      { numRuns: 100 },
    );
  });

  it('gives the same tree for LF, CRLF and CR line endings', () => {
    const lfDocument = fc
      .array(fc.tuple(indent, line), { maxLength: 30 })
      .map((lines) => lines.map(([i, l]) => i + l).join('\n'));
    fc.assert(
      fc.property(lfDocument, (source) => {
        const lf = shape(parse(source));
        expect(shape(parse(source.replace(/\n/g, '\r\n')))).toEqual(lf);
        expect(shape(parse(source.replace(/\n/g, '\r')))).toEqual(lf);
      }),
      { numRuns: 300 },
    );
  });

  it('reports the same diagnostic codes regardless of line endings', () => {
    const lfDocument = fc
      .array(fc.tuple(indent, line), { maxLength: 20 })
      .map((lines) => lines.map(([i, l]) => i + l).join('\n'));
    fc.assert(
      fc.property(lfDocument, (source) => {
        const codes = (s: string) =>
          parse(s).diagnostics.map(
            (d) => `${d.code}@${d.range.start.line}:${d.range.start.column}`,
          );
        expect(codes(source.replace(/\n/g, '\r\n'))).toEqual(codes(source));
      }),
      { numRuns: 200 },
    );
  });
});
