import { describe, expect, it } from 'vitest';
import { collectAnchors, parse, Slugger, slugify } from '@markup-lang/core';

describe('slugify', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['  Trim me  ', 'trim-me'],
    ['What’s new?', 'whats-new'],
    ['C++ & Rust!', 'c--rust'],
    ['Olá, mundo', 'olá-mundo'],
    ['snake_case', 'snake_case'],
    ['日本語 タイトル', '日本語-タイトル'],
    ['🚀 Launch', '-launch'],
  ])('%j → %j', (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });
});

describe('Slugger', () => {
  it('deduplicates with numeric suffixes', () => {
    const s = new Slugger();
    expect([s.slug('A'), s.slug('A'), s.slug('A'), s.slug('A-1')]).toEqual([
      'a',
      'a-1',
      'a-2',
      'a-1-1',
    ]);
  });

  it('never reuses reserved ids', () => {
    const s = new Slugger();
    s.reserve('intro');
    expect(s.slug('Intro')).toBe('intro-1');
  });

  it('uses a fallback for empty slugs', () => {
    const s = new Slugger();
    expect([s.slug('!!!'), s.slug('')]).toEqual(['section', 'section-1']);
  });
});

describe('collectAnchors', () => {
  it('collects heading slugs and explicit ids in document order', () => {
    const { document } = parse(
      '# Intro\n\n## Setup {#install}\n\n:::note{#tip-1}\nx\n:::\n\n# Intro',
    );
    const { anchors, headingIds } = collectAnchors(document);
    expect(anchors.map((a) => [a.id, a.explicit])).toEqual([
      ['intro', false],
      ['install', true],
      ['tip-1', true],
      ['intro-1', false],
    ]);
    expect([...headingIds.values()]).toEqual(['install', 'intro', 'intro-1']);
  });
});
