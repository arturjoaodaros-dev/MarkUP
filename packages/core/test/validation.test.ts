import { describe, expect, it } from 'vitest';
import { isSafeUrl, parse } from '@markup-lang/core';
import { codeList, codes, diagnostics } from './helpers.ts';

describe('unknown components', () => {
  it('warns and suggests the closest name, preferring the same form', () => {
    const d = diagnostics(':::nott\nx\n:::');
    expect(d.map((x) => x.code)).toEqual(['MU2001']);
    expect(d[0]!.message).toMatch(/did you mean `note`/);
    expect(d[0]!.fixes?.[0]?.edits[0]?.newText).toBe('note');
    expect(diagnostics('Press :kdb[K]')[0]!.message).toMatch(/`kbd`/);
  });

  it('does not suggest unrelated names', () => {
    expect(diagnostics(':::zzzzzz\nx\n:::')[0]!.fixes).toBeUndefined();
  });
});

describe('forms, labels and attributes', () => {
  it('rejects a form the component does not support', () => {
    expect(codeList('::card')).toEqual(['MU2002']);
    expect(codeList(':toc{depth=2}')).toEqual(['MU2002']);
  });

  it('requires labels where declared and flags unused ones', () => {
    expect(codeList(':::tabs\n:::tab\nx\n:::\n:::')).toEqual(['MU2006']);
    expect(codeList(':::columns[x]\n:::column\ny\n:::\n:::')).toEqual(['MU2007']);
  });

  it('coerces and checks attribute values', () => {
    expect(codeList('::toc{depth=9}')).toEqual(['MU2004']);
    expect(codeList('::toc{depth=two}')).toEqual(['MU2004']);
    expect(codeList('::toc{depth=2.5}')).toEqual(['MU2004']);
    expect(codeList('::toc{depth=4}')).toEqual([]);
    expect(codeList(':::details{open}\nx\n:::')).toEqual([]);
    expect(codeList(':::details{open=maybe}\nx\n:::')).toEqual(['MU2004']);
  });

  it('suggests enum values and attribute names', () => {
    const [value] = diagnostics(':badge[x]{variant=sucess}');
    expect(value!.fixes?.[0]?.edits[0]?.newText).toBe('success');
    const [name] = diagnostics(':badge[x]{varient=info}');
    expect(name!.code).toBe('MU2003');
    expect(name!.fixes?.[0]?.edits[0]?.newText).toBe('variant');
  });

  it('always accepts ids and classes', () => {
    expect(codeList(':::note{#n .wide}\nx\n:::')).toEqual([]);
  });

  it('reports missing required attributes', () => {
    expect(codeList(':abbr[HTML]')).toEqual(['MU2005']);
    expect(codeList('::progress')).toEqual(['MU2005']);
  });

  it('runs custom validators', () => {
    expect(codeList('::progress{value=150}')).toEqual(['MU2004']);
    expect(codeList('::toc{from=4 depth=2}')).toEqual(['MU2004']);
  });
});

describe('structure', () => {
  it('checks allowed parents', () => {
    expect(codeList(':::tab[A]\nx\n:::')).toEqual(['MU2008']);
    expect(codeList('::::tabs\n:::tab[A]\nx\n:::\n::::')).toEqual([]);
  });

  it('checks allowed children', () => {
    expect(codes('::::tabs\nloose text\n:::tab[A]\nx\n:::\n::::')).toEqual(['MU2009 2:1']);
    expect(codeList('::::tabs\n<!-- a comment is fine -->\n:::tab[A]\nx\n:::\n::::')).toEqual([]);
  });

  it('requires bodies where declared', () => {
    expect(codeList(':::chart\n:::')).toEqual(['MU2011']);
  });
});

describe('chart data', () => {
  it('validates values against the schema with precise positions', () => {
    expect(codes(':::chart\ntype: bars\ndata:\n  a: 1\n:::')).toEqual(['MU2010 2:7']);
    expect(codes(':::chart\ndata:\n  a: many\n:::')).toEqual(['MU2010 3:6']);
  });

  it('reports unknown keys on the key', () => {
    const d = diagnostics(':::chart\ndata:\n  a: 1\ncolour: red\n:::');
    expect(d.map((x) => `${x.code} ${x.range.start.line}:${x.range.start.column}`)).toEqual([
      'MU2010 4:1',
    ]);
  });

  it('requires data or series', () => {
    expect(diagnostics(':::chart\ntype: bar\n:::')[0]!.message).toMatch(/either `data`/);
  });

  it('checks series lengths against labels', () => {
    const d = diagnostics(
      ':::chart\nlabels: [a, b, c]\nseries:\n  - name: s\n    values: [1, 2]\n:::',
    );
    expect(d.map((x) => [x.code, x.severity])).toEqual([['MU2010', 'warning']]);
  });

  it('warns when a setting is given both as attribute and in the body', () => {
    expect(
      diagnostics(':::chart{type=line}\ntype: bar\ndata:\n  a: 1\n:::').map((x) => x.severity),
    ).toEqual(['warning']);
  });
});

describe('document-level rules', () => {
  it('warns about undefined and unused footnotes', () => {
    expect(codes('Text[^a].\n\n[^b]: Unused.')).toEqual(['MU2021 1:5', 'MU2022 3:1']);
  });

  it('warns about fragment links without a target, with suggestions', () => {
    const d = diagnostics(
      '# Getting Started\n\nSee [setup](#getting-startd) and [ok](#getting-started).',
    );
    expect(d.map((x) => x.code)).toEqual(['MU2025']);
    expect(d[0]!.message).toMatch(/#getting-started/);
  });

  it('accepts links to explicit ids anywhere', () => {
    expect(codeList(':::note{#box}\nx\n:::\n\n[go](#box)')).toEqual([]);
  });

  it('warns about duplicate explicit ids', () => {
    expect(codes('# A {#x}\n# B {#x}')).toEqual(['MU2020 2:6']);
  });

  it('warns about unsafe URLs', () => {
    expect(codeList('[x](javascript:alert(1))')).toEqual(['MU2023']);
    expect(codeList('[x](JaVaScRiPt:alert(1))')).toEqual(['MU2023']);
    expect(codeList('![x](data:text/html;base64,AAA)')).toEqual(['MU2023']);
    expect(codeList('![x](data:image/png;base64,AAA)')).toEqual([]);
  });

  it('can be switched off', () => {
    expect(parse(':::nope\n:::', { validate: false }).diagnostics).toEqual([]);
  });
});

describe('isSafeUrl', () => {
  it.each([
    ['https://a.com', true],
    ['mailto:a@b.c', true],
    ['/relative', true],
    ['./x', true],
    ['#frag', true],
    ['page.html', true],
    ['?q=1', true],
    ['', true],
    ['javascript:alert(1)', false],
    ['java\tscript:alert(1)', false],
    [' javascript:alert(1)', false],
    ['vbscript:x', false],
    ['file:///etc/passwd', false],
    ['data:text/html,x', false],
  ])('%j → %s', (url, safe) => {
    expect(isSafeUrl(url)).toBe(safe);
  });
});
