import {
  getEntry,
  inlineText,
  parse,
  type Diagnostic,
  type Document,
  type ParseOptions,
} from '@markup-lang/core';
import { escapeHtml } from './escape.ts';
import { renderHtml, type HtmlOptions } from './render.ts';
import { MARKUP_CSS } from './theme.ts';

export interface DocumentOptions extends HtmlOptions {
  /** Page title. Defaults to front matter `title`, then the first heading. */
  title?: string;
  /** `light`, `dark` or `auto` (follows the system). */
  theme?: 'light' | 'dark' | 'auto';
  /** Extra CSS appended after the theme. */
  css?: string;
  /** Extra HTML for <head> (trusted, from the caller — never from the document). */
  head?: string;
}

/** Metadata read from front matter, with the first heading as a title fallback. */
export function documentMeta(document: Document): {
  title: string | null;
  description: string | null;
  lang: string | null;
} {
  const fm = document.frontMatter?.value ?? null;
  const str = (key: string) => {
    const entry = getEntry(fm, key);
    return entry?.value.kind === 'scalar' && entry.value.value !== null
      ? String(entry.value.value)
      : null;
  };
  let title = str('title');
  if (!title) {
    const heading = document.children.find((node) => node.type === 'heading');
    if (heading?.type === 'heading') title = inlineText(heading.children);
  }
  return { title, description: str('description'), lang: str('lang') };
}

/** A complete, self-contained HTML page (inline CSS, no scripts). */
export function renderDocument(document: Document, options: DocumentOptions = {}): string {
  const meta = documentMeta(document);
  const title = options.title ?? meta.title ?? 'MarkUP document';
  const theme = options.theme ?? 'auto';
  const lang =
    meta.lang && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(meta.lang) ? meta.lang : 'en';
  return `<!doctype html>
<html${theme === 'auto' ? '' : ` data-theme="${theme}"`} lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MarkUP">
<title>${escapeHtml(title)}</title>
${meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}">\n` : ''}<style>
html { background: var(--mu-page, #ffffff); }
@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) { --mu-page: #16181d; } }
html[data-theme="dark"] { --mu-page: #16181d; }
html[data-theme="light"] { --mu-page: #ffffff; }
body { margin: 0; }
${MARKUP_CSS}
${options.css ?? ''}
</style>
${options.head ?? ''}</head>
<body>
<main class="markup-body"${theme === 'auto' ? '' : ` data-theme="${theme}"`}>
${renderHtml(document, options)}</main>
</body>
</html>
`;
}

export interface RenderResult {
  html: string;
  document: Document;
  diagnostics: Diagnostic[];
}

/** Parses and renders in one step. */
export function markupToHtml(
  source: string,
  options: HtmlOptions & ParseOptions & { standalone?: boolean | DocumentOptions } = {},
): RenderResult {
  const { document, diagnostics } = parse(source, options);
  const html = options.standalone
    ? renderDocument(document, {
        ...options,
        ...(typeof options.standalone === 'object' ? options.standalone : {}),
      })
    : renderHtml(document, options);
  return { html, document, diagnostics };
}
