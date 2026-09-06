// Roda DENTRO do webview (contexto de navegador), nunca no host da
// extensão. Monta o mesmo `MarkupDocument` de `@markup/renderer` usado pelo
// app web — não é um segundo renderer.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import type { Document } from '@markup/core';
import { MarkupDocument } from '@markup/renderer';

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

type ExtensionMessage =
  | { type: 'init'; ast: Document }
  | { type: 'update'; ast: Document }
  | { type: 'highlight'; offset: number };

const vscode = acquireVsCodeApi();
const root = createRoot(document.getElementById('root')!);

// O VS Code marca <body> com "vscode-dark"/"vscode-light"/"vscode-high-contrast"
// automaticamente; traduzimos isso para as classes de tema do document.css.
document.body.classList.add(document.body.classList.contains('vscode-dark') ? 'mu-theme-dark' : 'mu-theme-light');

function render(ast: Document) {
  root.render(createElement(MarkupDocument, { document: ast, sourceMap: true }));
}

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
    case 'update':
      render(message.ast);
      break;
    case 'highlight':
      applyHighlight(message.offset);
      break;
  }
});

document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-mu-start]');
  if (!target) return;
  const offset = Number(target.getAttribute('data-mu-start'));
  if (Number.isFinite(offset)) {
    vscode.postMessage({ type: 'revealPosition', offset });
  }
});

let lastHighlighted: HTMLElement | null = null;

function applyHighlight(offset: number) {
  const candidates = document.querySelectorAll<HTMLElement>('[data-mu-start]');
  let match: HTMLElement | null = null;
  for (const el of candidates) {
    const start = Number(el.getAttribute('data-mu-start'));
    const end = Number(el.getAttribute('data-mu-end'));
    if (offset >= start && offset <= end) {
      if (!match || Number(el.getAttribute('data-mu-start')) >= Number(match.getAttribute('data-mu-start'))) {
        match = el;
      }
    }
  }
  if (lastHighlighted) lastHighlighted.classList.remove('mu-sync-highlight');
  if (match) {
    match.classList.add('mu-sync-highlight');
    match.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  lastHighlighted = match;
}

vscode.postMessage({ type: 'ready' });
