/**
 * Performance and resource tests. Budgets are generous so that slow CI machines
 * pass, but quadratic algorithms or unbounded recursion fail clearly.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@markup-lang/core';
import { checkInvariants } from './invariants.ts';

function time(source: string): number {
  const start = performance.now();
  parse(source);
  return performance.now() - start;
}

const CHUNK = `## Section

A paragraph with **strong**, *emphasis*, \`code\`, a [link](https://example.com) and :badge[tag]{variant=info}.
It continues on a second line with ~~strike~~ and an autolink https://markup.dev/docs.

- item one
- item two
  - nested *item*

> A quote with a [reference][ref].

\`\`\`ts
const answer = 42;
\`\`\`

:::note[Heads up]
Nested **content** inside a callout.
:::

| a | b |
|---|---|
| 1 | 2 |

[ref]: https://example.com
`;

describe('performance', () => {
  it('parses about 1 MB of realistic content quickly', () => {
    const source = CHUNK.repeat(Math.ceil(1_000_000 / CHUNK.length));
    expect(source.length).toBeGreaterThan(1_000_000);
    const ms = time(source);
    expect(ms).toBeLessThan(5000);
  });

  it('scales linearly (10× input takes well under 30× time)', () => {
    const small = CHUNK.repeat(200);
    const large = CHUNK.repeat(2000);
    time(small); // warm up
    const a = Math.max(1, time(small));
    const b = time(large);
    expect(b / a).toBeLessThan(30);
  });

  const pathological: [string, string][] = [
    ['50k asterisks', '*'.repeat(50_000)],
    ['alternating emphasis openers', '*a **b '.repeat(10_000)],
    ['50k opening brackets', '['.repeat(50_000)],
    ['unclosed links', '[a](b '.repeat(10_000)],
    ['50k backticks runs', '`a``b```c'.repeat(5_000)],
    [
      'many unmatched code spans',
      Array.from({ length: 3_000 }, (_, i) => '`'.repeat((i % 50) + 1) + 'x').join(' '),
    ],
    ['deep emphasis nesting', '*'.repeat(5_000) + 'x' + '*'.repeat(5_000)],
    ['directive label nesting', ':badge['.repeat(2_000) + 'x' + ']'.repeat(2_000)],
    ['10k nested blockquotes', '>'.repeat(10_000) + ' deep'],
    [
      'deeply nested lists',
      Array.from({ length: 2_000 }, (_, i) => `${' '.repeat(i * 2)}- item`).join('\n'),
    ],
    ['2k nested directives', ':::note\n'.repeat(2_000) + 'x\n' + ':::\n'.repeat(2_000)],
    ['2k unclosed directives', ':::note\n'.repeat(2_000)],
    ['many stray fences', ':::\n'.repeat(20_000)],
    ['huge table', '| a | b |\n|---|---|\n' + '| 1 | 2 |\n'.repeat(20_000)],
    ['long single line', 'word '.repeat(200_000)],
    ['many entities', '&amp;&#65;&bogus;'.repeat(20_000)],
    ['many attribute blocks', ':badge[x]{a=1 b="2" .c #d}'.repeat(5_000)],
    [
      'deep MarkUP Data',
      ':::chart\n' +
        Array.from({ length: 1_000 }, (_, i) => `${' '.repeat(i)}k${i}:`).join('\n') +
        '\n:::',
    ],
    [
      'many footnotes',
      Array.from({ length: 5_000 }, (_, i) => `x[^${i}]`).join(' ') +
        '\n\n' +
        Array.from({ length: 5_000 }, (_, i) => `[^${i}]: n`).join('\n'),
    ],
    ['many links to anchors', '# Title\n\n' + '[a](#missing) '.repeat(5_000)],
  ];

  it.each(pathological)('handles %s', (_name, source) => {
    const ms = time(source);
    expect(ms).toBeLessThan(4000);
  });

  it('keeps invariants on pathological input', () => {
    for (const [, source] of pathological.slice(0, 12)) {
      expect(checkInvariants(source.slice(0, 20_000))).toEqual([]);
    }
  });

  it('caps block nesting and reports it once per line', () => {
    const { diagnostics, document } = parse('>'.repeat(200) + ' deep');
    expect(diagnostics.filter((d) => d.code === 'MU1015')).toHaveLength(1);
    expect(JSON.stringify(document)).toContain('deep');
  });
});
