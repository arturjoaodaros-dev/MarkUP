/**
 * Builds the documentation website into site/.
 *
 * - docs/**     → site/**           (docs/index.md is the home page)
 * - examples/** → site/examples/**
 * - downloads   → site/downloads/   the VS Code extension and, when built locally, the
 *                                   desktop installers, under stable names
 *
 * In production (Vercel, see vercel.json) the desktop installers and their checksums
 * redirect to the latest GitHub release, built on Windows by the Desktop release workflow.
 *
 * Pages get a sidebar from NAV, a table of contents from their h2/h3 headings, and
 * previous/next links. MarkUP code blocks are highlighted with the language service;
 * those marked `{result}` (and every example on the components page) are followed by
 * their rendered output. Relative links are resolved against the source file: links to
 * other pages point to their HTML, links to anything else in the repository to GitHub.
 *
 *   node --conditions=source scripts/site/build.ts                        (downloads optional)
 *   node --conditions=source scripts/site/build.ts --require-downloads    (fail if one is missing)
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Block,
  type Code,
  type ContainerDirective,
  type Document,
  parse,
} from '@markup-lang/core';
import {
  documentMeta,
  escapeHtml,
  MARKUP_CSS,
  renderHtml,
  type HtmlOptions,
} from '@markup-lang/html';
import { getHighlights, LanguageService } from '@markup-lang/language-service';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const REPO = 'https://github.com/arturjoaodaros-dev/MarkUP';
const BASE = 'https://markup.rweb.site/';
const PAGE = /\.(?:markup|mkup|md)$/i;
/** The logo mark (scripts/icon.mjs), drawn for the navy top bar. */
const MARK =
  '<svg viewBox="0 0 100 100" width="22" height="22" aria-hidden="true"><polygon fill="#f2f4f7" points="8,12 30,25 30,76 8,90"/><polygon fill="#1f5cb8" points="70,24 92,10 92,90 70,76"/><polygon fill="#2f80ed" points="30,25 50,36.8 92,10 92,40 50,66.8 30,55"/></svg>';

const json = (path: string) =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as { version: string };
const desktopVersion = json('packages/desktop/src-tauri/tauri.conf.json').version;
const extensionVersion = json('packages/vscode/package.json').version;
const release = 'packages/desktop/src-tauri/target/release';

/** Published name → build output. Stable names keep the links on the installation page valid. */
export const DOWNLOADS: [string, string][] = [
  ['MarkUP-Setup-x64.exe', `${release}/bundle/nsis/MarkUP_${desktopVersion}_x64-setup.exe`],
  ['MarkUP-x64.msi', `${release}/bundle/msi/MarkUP_${desktopVersion}_x64_en-US.msi`],
  ['MarkUP-Portable-x64.exe', `${release}/markup-desktop.exe`],
  ['markup.vsix', 'packages/vscode/dist/markup.vsix'],
];

interface NavPage {
  title: string;
  /** Source file, relative to the repository root. */
  source: string;
}
interface NavGroup {
  title: string;
  pages: NavPage[];
}
type NavEntry = NavPage | NavGroup;

const adrs = readdirSync(join(root, 'docs/adr'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => ({ title: headingOf(`docs/adr/${f}`), source: `docs/adr/${f}` }));

/** The sidebar, in reading order. Every published page appears here exactly once. */
export const NAV: NavEntry[] = [
  { title: 'Introduction', source: 'docs/index.md' },
  { title: 'Installation', source: 'docs/installation.md' },
  { title: 'Quick start', source: 'docs/quick-start.md' },
  {
    title: 'Syntax',
    pages: [
      { title: 'Markdown', source: 'docs/syntax/markdown.md' },
      { title: 'Directives', source: 'docs/syntax/directives.md' },
      { title: 'Attributes', source: 'docs/syntax/attributes.md' },
      { title: 'Front matter and data', source: 'docs/syntax/data.md' },
    ],
  },
  { title: 'Components', source: 'docs/components.md' },
  {
    title: 'Tools',
    pages: [
      { title: 'Command line', source: 'docs/cli.md' },
      { title: 'VS Code extension', source: 'docs/vscode.md' },
      { title: 'MarkUP Desktop', source: 'docs/desktop.md' },
    ],
  },
  { title: 'Extending MarkUP', source: 'docs/extending.md' },
  {
    title: 'Reference',
    pages: [
      { title: 'Specification', source: 'docs/spec.md' },
      { title: 'Diagnostics', source: 'docs/errors.md' },
    ],
  },
  {
    title: 'Project',
    pages: [
      { title: 'Architecture', source: 'docs/architecture.md' },
      { title: 'Development', source: 'docs/development.md' },
    ],
  },
  { title: 'Design decisions', pages: adrs },
  {
    title: 'Examples',
    pages: [
      { title: 'Showcase', source: 'examples/showcase.markup' },
      { title: 'Basic document', source: 'examples/basic.markup' },
    ],
  },
];

export const PAGES: NavPage[] = NAV.flatMap((e) => ('pages' in e ? e.pages : [e]));

function headingOf(source: string): string {
  const match = /^# (.+)$/m.exec(readFileSync(join(root, source), 'utf8'));
  return match ? match[1]!.trim() : source;
}

/** Where a repository file is published on the site, or null if it is not. */
export function sitePath(file: string): string | null {
  const target = file.startsWith('docs/')
    ? file.slice(5)
    : file.startsWith('examples/')
      ? file
      : null;
  if (target === null) return null;
  if (PAGE.test(target)) return target.replace(PAGE, '.html');
  return target.startsWith('downloads/') ? target : null;
}

export function linkRewriter(source: string, page: string) {
  return (url: string): string => {
    if (/^[a-z][a-z0-9+.-]*:|^[#/]/i.test(url)) return url;
    const [, path = '', suffix = ''] = /^([^?#]*)(.*)$/s.exec(url)!;
    const target = posix.normalize(posix.join(posix.dirname(source), path));
    if (target.startsWith('../')) return url;
    const published = sitePath(target);
    if (published === null) return `${REPO}/blob/main/${target}${suffix}`;
    return posix.relative(posix.dirname(page), published) + suffix;
  };
}

// ---------------------------------------------------------------------------
// Code

const service = new LanguageService();

/** MarkUP code highlighted with the same analysis the editors use. */
export function highlightMarkup(code: string): string {
  const highlights = getHighlights(service.analyze(code, 'site-example'));
  // The innermost highlight wins at every position: split at every boundary.
  const cuts = new Set([0, code.length]);
  for (const h of highlights) cuts.add(h.from).add(h.to);
  const points = [...cuts].sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    let kind: string | null = null;
    let size = Infinity;
    for (const h of highlights) {
      if (h.from <= from && h.to >= to && h.to - h.from < size) {
        kind = h.kind;
        size = h.to - h.from;
      }
    }
    const text = escapeHtml(code.slice(from, to));
    out += kind ? `<span class="hl-${kind}">${text}</span>` : text;
  }
  return out;
}

const highlight: HtmlOptions['highlight'] = (code, lang) =>
  lang === 'markup' || lang === 'mkup' ? highlightMarkup(code) : null;

/** Replaces example code blocks with a directive that renders the code and its result. */
function markExamples(document: Document, all: boolean): Map<ContainerDirective, Code> {
  const examples = new Map<ContainerDirective, Code>();
  const walk = (children: Block[]) => {
    children.forEach((node, i) => {
      if (
        node.type === 'code' &&
        node.lang === 'markup' &&
        (all || node.attributes?.values.result === true)
      ) {
        const example = {
          type: 'containerDirective',
          name: 'site-example',
          label: null,
          attributes: null,
          body: { kind: 'flow', children: [] },
          position: node.position,
        } as unknown as ContainerDirective;
        examples.set(example, node);
        children[i] = example;
        return;
      }
      if ('children' in node && Array.isArray(node.children)) walk(node.children as Block[]);
      if (node.type === 'containerDirective' && node.body.kind === 'flow')
        walk(node.body.children);
    });
  };
  walk(document.children);
  return examples;
}

// ---------------------------------------------------------------------------
// Pages

interface Rendered {
  page: string;
  title: string;
  description: string | null;
  html: string;
  toc: { depth: number; id: string; text: string }[];
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

function renderPage(source: string, page: string, problems: string[]): Rendered {
  const text = readFileSync(join(root, source), 'utf8');
  const { document, diagnostics } = parse(text);
  for (const d of diagnostics)
    if (d.severity === 'error')
      problems.push(`${source}:${d.range.start.line}:${d.range.start.column} ${d.code} ${d.message}`);
  const rewriteUrl = linkRewriter(source, page);
  const examples = markExamples(document, source === 'docs/components.md');
  const html = renderHtml(document, {
    highlight,
    rewriteUrl,
    components: {
      'site-example': (node, ctx) => {
        const code = examples.get(node as ContainerDirective)!;
        const result = renderHtml(parse(code.value).document, {
          highlight,
          rewriteUrl,
          headingAnchors: false,
        }).replace(/<h([1-6]) id="[^"]*"/g, '<h$1');
        return `<div class="example">${ctx.blocks([code])}<div class="example-result"><!--result-->${result}<!--/result--></div></div>\n`;
      },
    },
  });
  const meta = documentMeta(document);
  const toc = [...html.matchAll(/<h([23]) id="([^"]+)"[^>]*>(.*?)<\/h\1>/g)].map((m) => ({
    depth: Number(m[1]),
    id: m[2]!,
    text: stripTags(m[3]!.replace(/<a class="mu-anchor".*?<\/a>/, '')).trim(),
  }));
  return {
    page,
    title: meta.title ?? headingOf(source),
    description: meta.description,
    html,
    toc,
  };
}

function sidebar(current: string, rel: (target: string) => string): string {
  const link = (p: NavPage) => {
    const page = sitePath(p.source)!;
    return `<li><a href="${rel(page)}"${page === current ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`;
  };
  return NAV.map((entry) =>
    'pages' in entry
      ? `<li class="nav-group"><span class="nav-group-title">${escapeHtml(entry.title)}</span><ul>${entry.pages.map(link).join('')}</ul></li>`
      : link(entry),
  ).join('');
}

function layout(
  r: Rendered,
  rel: (target: string) => string,
  neighbours: { prev: NavPage | null; next: NavPage | null; source: string | null },
): string {
  const isHome = r.page === 'index.html';
  const title = isHome ? 'MarkUP — Markdown with directives' : `${r.title} — MarkUP`;
  const description =
    r.description ?? 'Documentation of MarkUP, a Markdown-compatible markup language.';
  const url = BASE + (isHome ? '' : r.page);
  const toc = r.toc.length
    ? `<aside class="toc" aria-labelledby="toc-title"><p id="toc-title" class="toc-title">On this page</p><ul>${r.toc
        .map(
          (h) =>
            `<li class="toc-${h.depth}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`,
        )
        .join('')}</ul></aside>`
    : '';
  const pager = (p: NavPage | null, kind: 'prev' | 'next') =>
    p
      ? `<a class="pager-${kind}" href="${rel(sitePath(p.source)!)}"><span>${kind === 'prev' ? 'Previous' : 'Next'}</span>${escapeHtml(p.title)}</a>`
      : '<span></span>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MarkUP">
<meta property="og:title" content="${escapeHtml(isHome ? 'MarkUP' : r.title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<meta name="theme-color" content="#1c2f4a">
<link rel="icon" href="${rel('icon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${rel('assets/site.css')}">
<script src="${rel('assets/site.js')}" defer></script>
</head>
<body data-root="${rel('')}">
<a class="skip-link" href="#content">Skip to content</a>
<header class="topbar">
<button class="menu-button" type="button" aria-controls="sidebar" aria-expanded="false">Menu</button>
<a class="brand" href="${rel('index.html')}">${MARK}<span>Mark<span class="brand-up">UP</span></span></a>
<div class="search" role="search">
<input class="search-input" type="search" placeholder="Search" aria-label="Search the documentation" autocomplete="off" spellcheck="false">
<div class="search-results" aria-label="Search results" aria-live="polite" hidden></div>
</div>
<a class="topbar-link" href="${REPO}">GitHub</a>
</header>
<div class="layout">
<nav class="sidebar" id="sidebar" aria-label="Documentation"><ul>${sidebar(r.page, rel)}</ul></nav>
<main class="content" id="content">
<article class="markup-body">
${r.html}</article>
<nav class="pager" aria-label="Pages">${pager(neighbours.prev, 'prev')}${pager(neighbours.next, 'next')}</nav>
<footer class="page-footer">${neighbours.source ? `<a href="${REPO}/edit/main/${neighbours.source}">Edit this page on GitHub</a> · ` : ''}MarkUP is released under the MIT license.</footer>
</main>
${toc}
</div>
</body>
</html>
`;
}

/** Search index: one entry per section (h2/h3), with its plain text. */
function searchEntries(r: Rendered): { p: string; s: string; t: string; x: string }[] {
  const html = r.html
    .replace(/<!--result-->[\s\S]*?<!--\/result-->/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '');
  const parts = html.split(/(?=<h[23] id=")/);
  return parts.map((part) => {
    const heading = /^<h[23] id="([^"]+)"[^>]*>(.*?)<\/h[23]>/.exec(part);
    return {
      p: r.page + (heading ? `#${heading[1]}` : ''),
      s: heading
        ? stripTags(heading[2]!.replace(/<a class="mu-anchor".*?<\/a>/, '')).trim()
        : '',
      t: r.title,
      x: stripTags(heading ? part.slice(heading[0].length) : part)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200),
    };
  });
}

export function build(out: string, requireDownloads = false): number {
  rmSync(out, { recursive: true, force: true });
  const problems: string[] = [];

  // Every page must be in the navigation, and every navigation entry must exist.
  const published = new Set(PAGES.map((p) => p.source));
  for (const dir of ['docs', 'examples'])
    for (const f of readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })) {
      const file = posix.join(dir, f.replaceAll('\\', '/'));
      if (PAGE.test(file) && statSync(join(root, file)).isFile() && !published.has(file))
        problems.push(`${file} is not in the site navigation (scripts/site/build.ts).`);
    }
  for (const p of PAGES)
    if (!existsSync(join(root, p.source))) problems.push(`Navigation entry ${p.source} is missing.`);

  const index: ReturnType<typeof searchEntries> = [];
  PAGES.forEach((p, i) => {
    const page = sitePath(p.source)!;
    const rendered = renderPage(p.source, page, problems);
    // All targets are root-relative paths; '' is the site root.
    const up = posix.relative(posix.dirname(page), '.');
    const rel = (target: string) => (up ? `${up}/` : '') + target || './';
    const html = layout(rendered, rel, {
      prev: PAGES[i - 1] ?? null,
      next: PAGES[i + 1] ?? null,
      source: p.source,
    });
    mkdirSync(dirname(join(out, page)), { recursive: true });
    writeFileSync(join(out, page), html);
    index.push(...searchEntries(rendered));
  });

  // 404: served at any path, so its links are absolute.
  const notFound = layout(
    {
      page: '404.html',
      title: 'Page not found',
      description: null,
      html: `<h1>Page not found</h1>\n<p>There is no page at this address. Use the navigation or the search, or go to the <a href="/">introduction</a>.</p>\n`,
      toc: [],
    },
    (t) => `/${t}`,
    { prev: null, next: null, source: null },
  );
  writeFileSync(join(out, '404.html'), notFound);

  mkdirSync(join(out, 'assets'));
  writeFileSync(
    join(out, 'assets/site.css'),
    `${MARKUP_CSS}\n${readFileSync(join(here, 'site.css'), 'utf8')}`,
  );
  writeFileSync(join(out, 'assets/site.js'), readFileSync(join(here, 'site.js'), 'utf8'));
  writeFileSync(join(out, 'assets/search.json'), JSON.stringify(index));
  writeFileSync(join(out, 'icon.svg'), readFileSync(join(root, 'packages/desktop/public/icon.svg')));
  writeFileSync(
    join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map((p) => {
      const page = sitePath(p.source)!;
      return `<url><loc>${BASE}${page === 'index.html' ? '' : page}</loc></url>`;
    }).join('\n')}\n</urlset>\n`,
  );
  writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);

  // The installation page names the versions it links to; keep it in step with the builds.
  const installPage = readFileSync(join(root, 'docs/installation.md'), 'utf8');
  for (const version of [desktopVersion, extensionVersion])
    if (!installPage.includes(`Version ${version}`))
      problems.push(`docs/installation.md does not mention version ${version}.`);

  mkdirSync(join(out, 'downloads'));
  const sums: string[] = [];
  let copied = 0;
  for (const [name, from] of DOWNLOADS) {
    let data: Buffer;
    try {
      data = readFileSync(join(root, from));
    } catch {
      if (requireDownloads) problems.push(`Missing download ${name} (${from}).`);
      else console.warn(`Missing download ${name} (${from}).`);
      continue;
    }
    writeFileSync(join(out, 'downloads', name), data);
    copied++;
    // Checksums cover the desktop downloads, like the release's SHA256SUMS.txt.
    if (name.startsWith('MarkUP-'))
      sums.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
  }
  if (sums.length) writeFileSync(join(out, 'downloads/SHA256SUMS.txt'), `${sums.join('\n')}\n`);

  for (const problem of problems) console.error(problem);
  console.log(
    `Site → ${relative(root, out) || out}: ${PAGES.length} pages, ${copied}/${DOWNLOADS.length} downloads`,
  );
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = build(join(root, 'site'), process.argv.includes('--require-downloads'));
}
