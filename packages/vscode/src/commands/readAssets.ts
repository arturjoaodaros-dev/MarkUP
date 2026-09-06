// Lê os CSS empacotados em `media/` (copiados de `@markup/renderer` e do
// KaTeX pelo script de build — ver `esbuild.js`). É o equivalente, no host
// Node da extensão, dos imports `?raw` que o app web usa via Vite: mesmo
// `exportHtml`, fonte de CSS diferente por plataforma.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type * as vscode from 'vscode';

export function readDocumentCss(context: vscode.ExtensionContext): string {
  return readFileSync(join(context.extensionPath, 'media', 'document.css'), 'utf-8');
}

export function readKatexCss(context: vscode.ExtensionContext): string {
  return readFileSync(join(context.extensionPath, 'media', 'katex.min.css'), 'utf-8');
}
