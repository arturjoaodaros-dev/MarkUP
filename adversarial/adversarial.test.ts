/**
 * MarkUP Adversarial — every layer against hostile input.
 *
 * Each document runs through the whole pipeline: parse (with structural
 * invariants), validation, HTML (balanced, no script, no javascript: URLs),
 * text, and every language-service feature at many cursor positions — within a
 * time budget.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parse } from '@markup-lang/core';
import { renderDocument, renderHtml } from '@markup-lang/html';
import { renderText } from '@markup-lang/text';
import {
  getCodeActions,
  getCompletions,
  getDefinition,
  getDocumentLinks,
  getFoldingRanges,
  getHighlights,
  getHover,
  getReferences,
  getSemanticTokens,
  getSymbols,
  LanguageService,
} from '@markup-lang/language-service';
import { checkInvariants } from '../packages/core/test/invariants.ts';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, 'corpus');
const corpus = Object.fromEntries(
  readdirSync(corpusDir).map((f) => [f, readFileSync(join(corpusDir, f), 'utf8')]),
);
const showcase = readFileSync(join(here, '../examples/showcase.markup'), 'utf8');

function balanced(html: string): boolean {
  const voids = new Set(['br', 'hr', 'img', 'input', 'meta']);
  const stack: string[] = [];
  for (const [, closing, name, selfClosing] of html.matchAll(
    /<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g,
  )) {
    const tag = name!.toLowerCase();
    if (selfClosing || (!closing && voids.has(tag))) continue;
    if (!closing) stack.push(tag);
    else if (stack.pop() !== tag) return false;
  }
  return stack.length === 0;
}

/** Runs every stage; returns the parse result for further assertions. */
function pipeline(source: string, positions = 40) {
  const result = parse(source);
  expect(checkInvariants(source, result)).toEqual([]);
  const html = renderHtml(result.document, { sourcePositions: true });
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/(?:href|src)="\s*(?:javascript|vbscript|data:text)/i);
  // Walk attribute tokens (values are always double-quoted and escaped), so text
  // inside a value is never mistaken for an attribute.
  expect(html).not.toMatch(/<[a-z]+(?:\s+[\w:.-]+(?:="[^"]*")?)*\s+on[a-z]+=/i);
  expect(balanced(html)).toBe(true);
  expect(balanced(renderDocument(result.document))).toBe(true);
  renderText(result.document);

  const service = new LanguageService();
  const analysis = service.analyze(source, 'doc');
  getHighlights(analysis);
  getSemanticTokens(analysis);
  getSymbols(analysis);
  getFoldingRanges(analysis);
  getDocumentLinks(analysis);
  getCodeActions(analysis, 0, source.length);
  const step = Math.max(1, Math.floor(source.length / positions));
  for (let offset = 0; offset <= source.length; offset += step) {
    getCompletions(analysis, offset);
    getHover(analysis, offset);
    getDefinition(analysis, offset);
    getReferences(analysis, offset);
  }
  return result;
}

function timed<T>(budgetMs: number, f: () => T): T {
  const start = performance.now();
  const value = f();
  expect(performance.now() - start).toBeLessThan(budgetMs);
  return value;
}

describe('hostile corpus', () => {
  it.each(Object.keys(corpus))('%s survives the whole pipeline', (file) => {
    timed(5000, () => pipeline(corpus[file]!, 400));
  });

  it('every prefix of every corpus document parses cleanly (truncated input)', () => {
    for (const source of [...Object.values(corpus), showcase]) {
      for (let end = 0; end <= source.length; end += 7) {
        const prefix = source.slice(0, end);
        expect(checkInvariants(prefix)).toEqual([]);
      }
    }
  });

  it('reports every kind of problem in a document full of them, each once', () => {
    const { diagnostics } = parse(corpus['many-errors.markup']!);
    const codes = new Set(diagnostics.map((d) => d.code));
    for (const code of [
      'MU1005',
      'MU1006',
      'MU1007',
      'MU1008',
      'MU1011',
      'MU1013',
      'MU1014',
      'MU1501',
      'MU1502',
      'MU1503',
      'MU2001',
      'MU2003',
      'MU2004',
      'MU2005',
      'MU2006',
      'MU2007',
      'MU2008',
      'MU2009',
      'MU2010',
      'MU2011',
      'MU2020',
      'MU2021',
      'MU2022',
      'MU2023',
      'MU2024',
      'MU2025',
    ]) {
      expect(codes, code).toContain(code);
    }
    // No two diagnostics with the same code at the same place.
    const keys = diagnostics.map((d) => `${d.code}@${d.range.start.offset}-${d.range.end.offset}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the content of unknown components and ignores prototype-like names', () => {
    const { document } = parse(corpus['unknown-components.markup']!);
    const html = renderHtml(document);
    expect(html).toContain('<strong>Content is kept.</strong>');
    expect(html).toContain('data-directive="constructor"');
    expect(html).toContain('data-directive="hasOwnProperty"');
    // Names start with a letter, so `:::__proto__` is ordinary text (with strong emphasis).
    expect(html).toContain('<p>:::<strong>proto</strong>');
    expect(({} as Record<string, unknown>).y).toBeUndefined();
  });

  it('handles nesting across quotes, lists and mismatched fences', () => {
    const { diagnostics } = pipeline(corpus['nested-components.markup']!);
    expect(diagnostics.filter((d) => d.code === 'MU1002').length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.code === 'MU1003')).toBe(true);
  });

  it('keeps Unicode intact and resolves anchors of repeated Unicode headings', () => {
    const { document, diagnostics } = pipeline(corpus['unicode.markup']!);
    expect(diagnostics.filter((d) => d.code === 'MU2025')).toEqual([]);
    const html = renderHtml(document);
    expect(html).toContain('id="título-repetido-1"');
    expect(html).toContain('👨‍👩‍👧‍👦');
    expect(renderText(document)).toContain('नमस्ते');
  });
});

describe('HTML injection', () => {
  it('produces no executable markup for any injection vector', () => {
    const source = corpus['xss.markup']!;
    pipeline(source);
    const html = renderDocument(parse(source).document);
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    expect(doc.querySelectorAll('script, iframe, object, embed').length).toBe(0);
    for (const el of doc.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        expect(attr.name, el.outerHTML.slice(0, 120)).not.toMatch(/^on/i);
        if (['href', 'src', 'action', 'formaction'].includes(attr.name)) {
          // eslint-disable-next-line no-control-regex
          expect(attr.value.replace(/[\x00-\x20]/g, '').toLowerCase()).not.toMatch(
            /^(javascript|vbscript|data:text)/,
          );
        }
        if (attr.name === 'style') expect(attr.value).not.toMatch(/[<>;{}]|url\(|expression/i);
      }
    }
    expect(doc.title).toBe('</title><script>alert(1)</script>');
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
  });
});

describe('generated hostile input', () => {
  const cases: [string, string][] = [
    ['deep blockquotes', '> '.repeat(5000) + 'x'],
    ['deep lists', Array.from({ length: 2000 }, (_, i) => `${' '.repeat(i * 2)}- item`).join('\n')],
    ['same-colon nesting', ':::note\n'.repeat(1500) + 'x\n' + ':::\n'.repeat(1500)],
    [
      'growing-colon nesting',
      Array.from({ length: 300 }, (_, i) => `${':'.repeat(303 - i)}note`).join('\n') +
        '\n' +
        Array.from({ length: 300 }, (_, i) => ':'.repeat(4 + i)).join('\n'),
    ],
    ['unclosed nesting', ':::note\n'.repeat(3000)],
    ['inline label nesting', ':badge['.repeat(10000) + 'x' + ']'.repeat(10000)],
    ['emphasis soup', '*_~`['.repeat(20000)],
    ['link soup', '[a](b "'.repeat(10000) + '[a](<' + '[x]('.repeat(10000)],
    [
      'bare URLs with parens and entities',
      'https://x.y/' + ')'.repeat(30000) + ' www.a.b' + '&a;'.repeat(20000),
    ],
    ['trailing-space runs', ('a' + ' '.repeat(50000) + 'b\n').repeat(3)],
    [
      'data nesting by indentation',
      ':::chart\n' +
        Array.from({ length: 1500 }, (_, i) => `${' '.repeat(i)}k:`).join('\n') +
        '\n:::',
    ],
    ['data flow nesting', ':::chart\ndata: ' + '['.repeat(20000) + '\n:::'],
    [
      'wide table',
      '|' +
        ' a |'.repeat(2000) +
        '\n|' +
        '---|'.repeat(2000) +
        '\n' +
        ('|' + ' 1 |'.repeat(2000) + '\n').repeat(20),
    ],
    ['thousands of identical headings', '# a\n\n## b\n'.repeat(5000)],
    [
      'thousands of definitions and references',
      Array.from({ length: 5000 }, (_, i) => `[l${i}]: /u${i}`).join('\n') +
        '\n\n' +
        '[l1] [missing] '.repeat(5000),
    ],
    ['thousands of errors', ':::nott\n:badge[x]{variant=nope}\n'.repeat(3000)],
    ['mixed line endings', 'a\r\n:::note\rb\n:::\r\n# h\r'.repeat(5000)],
    [
      'NUL, BOM, lone surrogates and controls',
      [0xfeff, 0x61, 0, 0x62, 0xd800, 0x63, 0xdfff, 0x64, 1, 0x7f, 0x2028, 0x65, 0x2029, 0x66]
        .map((c) => String.fromCharCode(c))
        .join('')
        .repeat(5000),
    ],
    [
      'binary noise',
      Array.from({ length: 100000 }, (_, i) => String.fromCharCode((i * 2654435761) % 65536)).join(
        '',
      ),
    ],
    [
      'completion on deeply indented lines',
      ' '.repeat(5000) + ':::' + '\n' + '\t'.repeat(3000) + '::',
    ],
  ];

  it.each(cases)('%s', (_name, source) => {
    timed(15000, () => pipeline(source, 30));
  });
});

describe('mutation fuzzing of a real document', () => {
  it('survives random edits of the showcase', () => {
    const edit = fc.record({
      at: fc.nat({ max: showcase.length }),
      remove: fc.nat({ max: 20 }),
      insert: fc.constantFrom(
        '',
        ':',
        ':::',
        '::::',
        '[',
        ']',
        '{',
        '}',
        '`',
        '```',
        '\n',
        '*',
        '|',
        '"',
        '#',
        '> ',
        '- ',
        '<!--',
        '&',
        '\\',
        ':::chart\n',
        '\t',
      ),
    });
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 6 }), (edits) => {
        let source = showcase;
        for (const e of edits) {
          const at = Math.min(e.at, source.length);
          source = source.slice(0, at) + e.insert + source.slice(at + e.remove);
        }
        pipeline(source, 10);
      }),
      { numRuns: 150 },
    );
  });
});
