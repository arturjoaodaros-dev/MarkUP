/**
 * Builds the documentation website into site/:
 *
 * - docs/**     → site/**           (docs/index.markup is the home page)
 * - examples/** → site/examples/**
 * - downloads   → site/downloads/   the desktop installers and the VS Code extension,
 *                                   copied from their build outputs under stable names
 *
 * Relative links are resolved against the source file: links to other pages point
 * to their HTML, links to anything else in the repository point to GitHub.
 *
 *   node --conditions=source scripts/site.ts                        (downloads optional)
 *   node --conditions=source scripts/site.ts --require-downloads    (fail if one is missing)
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@markup-lang/core';
import { renderDocument } from '@markup-lang/html';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/arturjoaodaros-dev/MarkUP';
const PAGE = /\.(?:markup|mkup|md)$/i;

const json = (path: string) =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as { version: string };
const desktopVersion = json('packages/desktop/src-tauri/tauri.conf.json').version;
const extensionVersion = json('packages/vscode/package.json').version;
const release = 'packages/desktop/src-tauri/target/release';

/** Published name → build output. Stable names keep the links on the download page valid. */
export const DOWNLOADS: [string, string][] = [
  ['MarkUP-Setup-x64.exe', `${release}/bundle/nsis/MarkUP_${desktopVersion}_x64-setup.exe`],
  ['MarkUP-x64.msi', `${release}/bundle/msi/MarkUP_${desktopVersion}_x64_en-US.msi`],
  ['MarkUP-Portable-x64.exe', `${release}/markup-desktop.exe`],
  ['markup.vsix', 'packages/vscode/dist/markup.vsix'],
];

const NAV: [string, string][] = [
  ['Get started', 'getting-started.html'],
  ['Components', 'components.html'],
  ['Specification', 'spec.html'],
  ['CLI', 'cli.html'],
  ['Download', 'download.html'],
];

const CSS = `
.site-nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  padding: 12px max(16px, calc((100% - 860px) / 2)); background: var(--nav-bg); border-bottom: 1px solid var(--nav-border);
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; backdrop-filter: blur(8px); }
.site-nav a { color: var(--nav-fg); text-decoration: none; }
.site-nav a:hover, .site-nav a[aria-current] { color: var(--nav-strong); }
.site-nav .brand { display: flex; align-items: center; gap: 8px; margin-right: auto; font-weight: 650; color: var(--nav-strong); }
.site-nav .brand img { width: 22px; height: 22px; }
html { --nav-bg: rgba(255,255,255,.88); --nav-border: #e6e8ee; --nav-fg: #5b6070; --nav-strong: #15171c; }
@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) {
  --nav-bg: rgba(22,24,29,.88); --nav-border: #2a2d35; --nav-fg: #9aa0ad; --nav-strong: #f1f2f5; } }
.markup-body td:first-child a { white-space: nowrap; }
`;

function files(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    .map((f) => posix.join(dir, f.replaceAll('\\', '/')))
    .filter((f) => PAGE.test(f) && statSync(join(root, f)).isFile())
    .sort();
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

function nav(page: string): string {
  const up = (href: string) => posix.relative(posix.dirname(page), href) || href;
  const links = NAV.map(
    ([label, href]) =>
      `<a href="${up(href)}"${href === page ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('');
  return `<header class="site-nav"><a class="brand" href="${up('index.html')}"><img src="${up('icon.svg')}" alt="">MarkUP</a>${links}<a href="${REPO}">GitHub</a></header>\n`;
}

export function build(out: string, requireDownloads = false): number {
  rmSync(out, { recursive: true, force: true });
  let problems = 0;
  for (const source of [...files('docs'), ...files('examples')]) {
    const page = sitePath(source)!;
    const text = readFileSync(join(root, source), 'utf8');
    const { document, diagnostics } = parse(text);
    for (const d of diagnostics.filter((d) => d.severity === 'error')) {
      console.error(
        `${source}:${d.range.start.line}:${d.range.start.column} ${d.code} ${d.message}`,
      );
      problems++;
    }
    const html = renderDocument(document, {
      css: CSS,
      rewriteUrl: linkRewriter(source, page),
      head: `<link rel="icon" href="${posix.relative(posix.dirname(page), 'icon.svg') || 'icon.svg'}">`,
    }).replace('<main class="markup-body">', `${nav(page)}<main class="markup-body">`);
    mkdirSync(dirname(join(out, page)), { recursive: true });
    writeFileSync(join(out, page), html);
  }
  copyFileSync(join(root, 'packages/desktop/public/icon.svg'), join(out, 'icon.svg'));

  // The download page names the versions it links to; keep it in step with the builds.
  const downloadPage = readFileSync(join(root, 'docs/download.md'), 'utf8');
  for (const version of [desktopVersion, extensionVersion]) {
    if (!downloadPage.includes(version)) {
      console.error(`docs/download.md does not mention version ${version}.`);
      problems++;
    }
  }

  mkdirSync(join(out, 'downloads'));
  const sums: string[] = [];
  for (const [name, from] of DOWNLOADS) {
    let data: Buffer;
    try {
      data = readFileSync(join(root, from));
    } catch {
      console[requireDownloads ? 'error' : 'warn'](`Missing download ${name} (${from}).`);
      if (requireDownloads) problems++;
      continue;
    }
    writeFileSync(join(out, 'downloads', name), data);
    sums.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
  }
  writeFileSync(join(out, 'downloads/SHA256SUMS.txt'), sums.length ? `${sums.join('\n')}\n` : '');
  console.log(
    `Site → ${relative(root, out) || out} (${sums.length}/${DOWNLOADS.length} downloads)`,
  );
  return problems ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = build(join(root, 'site'), process.argv.includes('--require-downloads'));
}
