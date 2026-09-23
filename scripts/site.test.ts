import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build, DOWNLOADS, linkRewriter } from './site.ts';

describe('documentation website', () => {
  let out: string;
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), 'markup-site-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(build(out)).toBe(0);
    vi.restoreAllMocks();
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

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
    const fromAdr = linkRewriter('docs/adr/0003-no-raw-html.md', 'adr/0003-no-raw-html.html');
    expect(fromAdr('../spec.md')).toBe('../spec.html');
  });

  it('has a home page and no broken relative links', () => {
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    // Served from the build or redirected to the latest release (vercel.json).
    const downloads = new Set([
      ...DOWNLOADS.map(([name]) => `downloads/${name}`),
      'downloads/SHA256SUMS.txt',
    ]);
    const pages = readdirSync(out, { recursive: true, encoding: 'utf8' })
      .map((f) => f.replaceAll('\\', '/'))
      .filter((f) => f.endsWith('.html'));
    expect(pages.length).toBeGreaterThan(15);
    const broken: string[] = [];
    for (const page of pages) {
      const html = readFileSync(join(out, page), 'utf8');
      expect(html, page).toContain('<header class="site-nav">');
      for (const [, url] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
        if (/^[a-z][a-z0-9+.-]*:|^#/i.test(url!)) continue;
        const target = posix.normalize(
          posix.join(posix.dirname(page), url!.replace(/[?#].*$/s, '')),
        );
        if (!downloads.has(target) && !existsSync(join(out, target)))
          broken.push(`${page} → ${url}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
