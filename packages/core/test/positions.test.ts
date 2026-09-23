import { describe, expect, it } from 'vitest';
import { LineIndex, parse, scanLines, selectAll } from '@markup-lang/core';
import { checkInvariants } from './invariants.ts';

const SAMPLE = `---
title: Sample
---
# Heading {#top}

A paragraph with **strong**, *em*, \`code\`, [a link](#top) and :badge[new]{variant=info}.
Second line
after a hard break.

> quote with *emphasis*
> - and a list

1. one
2. two
   - nested

\`\`\`ts {title="x.ts"}
const x = 1;
\`\`\`

| a | b |
|---|---|
| 1 | :kbd[K] |

::::tabs
:::tab[First]
Content
:::
::::

:::chart
data:
  a: 1
:::

Footnote[^1].

[^1]: The note.
`;

describe('source positions', () => {
  it('satisfy the structural invariants on a rich document', () => {
    expect(checkInvariants(SAMPLE)).toEqual([]);
  });

  it('point at the exact source of nodes', () => {
    const { document } = parse(SAMPLE);
    const strong = selectAll(document, 'strong')[0]!;
    expect(SAMPLE.slice(strong.position.start.offset, strong.position.end.offset)).toBe('**strong**');
    const link = selectAll(document, 'link')[0]!;
    expect(SAMPLE.slice(link.position.start.offset, link.position.end.offset)).toBe('[a link](#top)');
    const badge = selectAll(document, 'inlineDirective')[0]!;
    expect(SAMPLE.slice(badge.position.start.offset, badge.position.end.offset)).toBe(':badge[new]{variant=info}');
    expect(SAMPLE.slice(badge.nameRange.start.offset, badge.nameRange.end.offset)).toBe('badge');
    const heading = selectAll(document, 'heading')[0]!;
    expect(heading.position.start).toMatchObject({ line: 4, column: 1 });
  });

  it('map text inside blockquotes and list items to the right columns', () => {
    const { document } = parse('> - item *em*');
    const em = selectAll(document, 'emphasis')[0]!;
    expect(em.position.start).toMatchObject({ line: 1, column: 10 });
  });

  it('are correct with CRLF line endings', () => {
    const source = '# A\r\n\r\ntext **b**\r\n';
    expect(checkInvariants(source)).toEqual([]);
    const strong = selectAll(parse(source).document, 'strong')[0]!;
    expect(strong.position.start).toMatchObject({ line: 3, column: 6, offset: 12 });
  });

  it('count columns in UTF-16 code units', () => {
    const { document } = parse('😀 *x*');
    expect(selectAll(document, 'emphasis')[0]!.position.start).toMatchObject({ line: 1, column: 4, offset: 3 });
  });
});

describe('LineIndex', () => {
  it('converts offsets to points and back for every EOL style', () => {
    const text = 'a\nbc\r\nd\re';
    const index = new LineIndex(text);
    expect(index.lineCount).toBe(4);
    expect(index.pointAt(3)).toEqual({ line: 2, column: 2, offset: 3 });
    expect(index.pointAt(6)).toEqual({ line: 3, column: 1, offset: 6 });
    expect(index.pointAt(8)).toEqual({ line: 4, column: 1, offset: 8 });
    expect(index.offsetAt(2, 3)).toBe(4);
    expect(index.lineText(2)).toBe('bc');
    expect(index.pointAt(999)).toEqual({ line: 4, column: 2, offset: 9 });
  });
});

describe('scanLines', () => {
  it('keeps offsets exact', () => {
    expect(scanLines('a\r\nb\rc\n').map((l) => [l.text, l.start, l.end, l.eolLength])).toEqual([
      ['a', 0, 1, 2],
      ['b', 3, 4, 1],
      ['c', 5, 6, 1],
    ]);
    expect(scanLines('')).toHaveLength(1);
    expect(scanLines('\n\n')).toHaveLength(2);
  });
});
