// Wrapper específico do Vite em torno do `exportHtml` de `@markup/renderer`.
// `@markup/renderer` não sabe nada sobre bundlers — quem decide como ler o
// CSS do documento é quem o consome. Aqui é o único lugar do app web que
// usa a sintaxe `?raw`, exclusiva do Vite; a extensão do VS Code faz o
// equivalente lendo os mesmos arquivos via `node:fs`.

import { visit, type Document } from '@markup/core';
import { exportHtml, type ExportOptions } from '@markup/renderer';
import documentCss from '@markup/renderer/document.css?raw';

export async function exportHtmlBrowser(
  doc: Document,
  options: Omit<ExportOptions, 'documentCss' | 'katexCss'> = {},
): Promise<string> {
  let hasMath = false;
  visit(doc, (n) => {
    if (n.type === 'math') hasMath = true;
  });

  const katexCss = hasMath ? await import('katex/dist/katex.min.css?raw').then((m) => m.default) : undefined;

  return exportHtml(doc, { ...options, documentCss, katexCss });
}
