import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build, DOWNLOADS, highlightMarkup, linkRewriter, PAGES, sitePath } from './build.ts';

describe('documentation website', () => {
  let out: string;
  let errors: string[];
  let code: number;
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), 'markup-site-'));
    errors = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    code = build(out);
    vi.restoreAllMocks();
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('builds without problems (pages valid, all in the navigation)', () => {
    expect(errors).toEqual([]);
    expect(code).toBe(0);
  });

  it('maps links to published pages, downloads and GitHub', () => {
    const fromSpec = linkRewriter('docs/spec.md', 'spec.html');
    expect(fromSpec('cli.md#watch')).toBe('cli.html#watch');
    expect(fromSpec('adr/0001-parser-architecture.md')).toBe('adr/0001-parser-architecture.html');
    expect(fromSpec('../examples/showcase.markup')).toBe('examples/showcase.html');
    expect(fromSpec('downloads/markup.vsix')).toBe('downloads/markup.vsix');
    expect(fromSpec('../examples/plugins/video.mjs')).toBe(
      'https://github.com/arturjoaodaros-dev/MarkUP/blob/main/examples/plugins/video.mjs',
    );
    expect(fromSpec('https://example.com/a.md')).toBe('https://example.com/a.md');
    expect(fromSpec('#rules')).toBe('#rules');
    const fromSyntax = linkRewriter('docs/syntax/data.md', 'syntax/data.html');
    expect(fromSyntax('../spec.md#9-markup-data')).toBe('../spec.html#9-markup-data');
    expect(fromSyntax('directives.md')).toBe('directives.html');
  });

  it('highlights MarkUP with the language service, escaping the text', () => {
    const html = highlightMarkup(':::note[A <b>]{#x}\nText\n:::');
    expect(html).toContain('<span class="hl-directiveName">note</span>');
    expect(html).toContain('&lt;b&gt;');
    expect(html.replace(/<[^>]+>/g, '')).toBe(':::note[A &lt;b&gt;]{#x}\nText\n:::');
  });

  it('renders examples marked {result} followed by their output', () => {
    const page = readFileSync(join(out, 'syntax/directives.html'), 'utf8');
    expect(page).toContain('<div class="example">');
    expect(page).toMatch(/<div class="example-result"><!--result--><aside class="mu-callout mu-callout-tip/);
  });

  it('has a page per navigation entry, with metadata, and no broken relative links', () => {
    expect(PAGES.map((p) => sitePath(p.source))).toContain('index.html');
    // Served from the build or redirected to the latest release (vercel.json).
    const downloads = new Set([
      ...DOWNLOADS.map(([name]) => `downloads/${name}`),
      'downloads/SHA256SUMS.txt',
    ]);
    const pages = readdirSync(out, { recursive: true, encoding: 'utf8' })
      .map((f) => f.replaceAll('\\', '/'))
      .filter((f) => f.endsWith('.html') && f !== '404.html');
    expect(pages.sort()).toEqual(PAGES.map((p) => sitePath(p.source)!).sort());
    const broken: string[] = [];
    for (const page of pages) {
      const html = readFileSync(join(out, page), 'utf8');
      expect(html, page).toMatch(/<title>[^<]+<\/title>/);
      expect(html, page).toMatch(/<meta name="description" content="[^"]+">/);
      expect(html, page).toContain('<link rel="canonical" href="https://markup.rweb.site/');
      expect(html.match(/<h1[ >]/g)?.length ?? 0, page).toBeGreaterThanOrEqual(1);
      for (const [, url] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
        if (/^[a-z][a-z0-9+.-]*:|^#/i.test(url!)) continue;
        const target = posix.normalize(
          posix.join(posix.dirname(page), url!.replace(/[?#].*$/s, '')),
        );
        const file = target.endsWith('/') || target === '.' ? `${target}/index.html` : target;
        if (!downloads.has(target) && !existsSync(join(out, file)))
          broken.push(`${page} → ${url}`);
      }
    }
    expect(broken).toEqual([]);
    for (const file of ['assets/site.css', 'assets/site.js', 'assets/search.json', 'sitemap.xml', 'robots.txt', '404.html'])
      expect(existsSync(join(out, file)), file).toBe(true);
  });
});
