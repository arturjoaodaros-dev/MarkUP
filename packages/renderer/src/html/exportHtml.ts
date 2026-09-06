// Exportação de HTML estático. Não é um segundo renderer: é o mesmo
// `MarkupDocument` passado por `renderToStaticMarkup`, com o único ajuste
// de que os trechos assíncronos (KaTeX, highlight.js) são resolvidos ANTES
// de renderizar e injetados via `ExportContext`. Isso é o que impede que o
// HTML exportado divirja do preview ao vivo.
//
// Este módulo não sabe nada sobre bundlers: `documentCss`/`katexCss` chegam
// como texto já resolvido pelo chamador (import `?raw` no app Vite, leitura
// de arquivo via `node:fs` na extensão do VS Code). Isso é o que permite o
// mesmo `@markup/renderer` rodar tanto no navegador quanto no host Node de
// uma extensão, sem depender de sintaxe específica de um bundler.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CodeBlock, Document, MathBlock } from '@markup/core';
import { visit } from '@markup/core';
import type { ExportResolved } from '../ExportContext';
import { ExportContext } from '../ExportContext';
import { highlightCodeHtml, renderMathHtml } from '../lazyLibs';
import { MarkupDocument } from '../MarkupDocument';

export interface ExportOptions {
  title?: string;
  /** CSS do documento (ver `styles/document.css`). Obrigatório — o chamador decide como lê-lo. */
  documentCss: string;
  /** CSS do KaTeX (`katex/dist/katex.min.css`). Só é necessário quando o documento tem `:::math`. */
  katexCss?: string;
}

export async function exportHtml(doc: Document, options: ExportOptions): Promise<string> {
  const mathNodes: MathBlock[] = [];
  const codeNodes: CodeBlock[] = [];
  visit(doc, (n) => {
    if (n.type === 'math') mathNodes.push(n);
    if (n.type === 'codeBlock') codeNodes.push(n);
  });

  const [mathEntries, codeEntries] = await Promise.all([
    Promise.all(mathNodes.map(async (n) => [n, await renderMathHtml(n.value)] as const)),
    Promise.all(codeNodes.map(async (n) => [n, await highlightCodeHtml(n.value, n.lang)] as const)),
  ]);

  const resolved: ExportResolved = { math: new Map(mathEntries), code: new Map(codeEntries) };

  const bodyHtml = renderToStaticMarkup(
    createElement(ExportContext.Provider, { value: resolved }, createElement(MarkupDocument, { document: doc })),
  );

  const katexCss = mathNodes.length > 0 ? (options.katexCss ?? '') : '';
  const title = escapeHtmlText(options.title ?? 'Documento MarkUP');

  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${title}</title>`,
    '<style>',
    ':root{color-scheme:light dark;}',
    options.documentCss,
    katexCss,
    '</style>',
    '</head>',
    '<body>',
    `<div class="mu-document-root mu-theme-light">${bodyHtml}</div>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
