// Roda no Node (bundlado pelo esbuild, ver scripts/build.mjs). Cada página
// do site é Markdown/MarkUP de verdade, passado pelo mesmo parser e pelo
// mesmo `MarkupDocument` que a extensão do VS Code e o app web usam — o
// site não é um terceiro renderer, é o mesmo de sempre com um layout por
// cima.

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { collectHeadings, parse, slugifyHeading, type Document } from '@markup/core';
import { MarkupDocument } from '@markup/renderer';

export interface PageHeading {
  depth: number;
  text: string;
  slug: string;
}

export interface PageResult {
  slug: string;
  title: string;
  description: string;
  headings: PageHeading[];
  contentHtml: string;
}

interface PageSource {
  slug: string;
  title: string;
  description: string;
  /** Caminho absoluto do arquivo-fonte (Markdown ou MarkUP). */
  path: string;
  /** Profundidade máxima de heading a incluir no sumário lateral. */
  maxTocDepth?: number;
}

export function renderAll(pages: PageSource[]): PageResult[] {
  return pages.map(renderPage);
}

function renderPage(page: PageSource): PageResult {
  const source = readFileSync(page.path, 'utf-8');
  const { ast } = parse(source);
  const headings = headingsWithSlugs(ast, page.maxTocDepth ?? 3);
  const contentHtml = renderToStaticMarkup(createElement(MarkupDocument, { document: ast, anchors: true }));
  return { slug: page.slug, title: page.title, description: page.description, headings, contentHtml };
}

function headingsWithSlugs(ast: Document, maxDepth: number): PageHeading[] {
  const seen = new Map<string, number>();
  return collectHeadings(ast)
    .map((h) => ({ ...h, slug: slugifyHeading(h.text, seen) }))
    .filter((h) => h.depth <= maxDepth);
}
