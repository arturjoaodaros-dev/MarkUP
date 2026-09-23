/**
 * Runs inside the preview webview. Receives rendered HTML, patches the DOM with
 * morphdom (so scroll position, open <details> and selected tabs survive typing)
 * and keeps the editor and preview scrolled together.
 */
import morphdom from 'morphdom';
import { elementForLine, lineForOffset, offsetForLine } from '@markup-lang/html/scroll-sync';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): { line?: number } | undefined;
  setState(state: { line?: number }): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

type Message =
  | { type: 'update'; html: string; theme: 'light' | 'dark'; line?: number }
  | { type: 'scrollTo'; line: number }
  | { type: 'theme'; theme: 'light' | 'dark' };

const vscode = acquireVsCodeApi();
const main = document.querySelector<HTMLElement>('main.markup-body')!;
let first = true;
/** Scroll events caused by programmatic scrolling are not echoed back. */
let ignoreScrollUntil = 0;

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  main.dataset.theme = theme;
}

function scrollToLine(line: number): void {
  const offset = offsetForLine(main, line);
  if (offset === null) return;
  ignoreScrollUntil = Date.now() + 120;
  window.scrollTo({ top: Math.max(0, offset + main.offsetTop - 8) });
}

window.addEventListener('message', (event: MessageEvent<Message>) => {
  const message = event.data;
  switch (message.type) {
    case 'update': {
      applyTheme(message.theme);
      const next = document.createElement('main');
      next.className = main.className;
      next.dataset.theme = message.theme;
      next.innerHTML = message.html;
      morphdom(main, next, {
        onBeforeElUpdated(from, to) {
          // Keep interactive state that the author did not change.
          if (
            from instanceof HTMLDetailsElement &&
            to instanceof HTMLDetailsElement &&
            from.open !== to.open &&
            !to.hasAttribute('open')
          ) {
            to.open = from.open;
          }
          if (
            from instanceof HTMLInputElement &&
            to instanceof HTMLInputElement &&
            from.type === 'radio'
          )
            to.checked = from.checked;
          return !from.isEqualNode(to);
        },
      });
      if (first) {
        first = false;
        const line = vscode.getState()?.line ?? message.line;
        if (line !== undefined) scrollToLine(line + 1);
      }
      break;
    }
    case 'scrollTo':
      scrollToLine(message.line);
      break;
    case 'theme':
      applyTheme(message.theme);
      break;
  }
});

let frame = 0;
window.addEventListener('scroll', () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (Date.now() < ignoreScrollUntil) return;
    const line = lineForOffset(main, window.scrollY - main.offsetTop + 8);
    if (line === null) return;
    vscode.setState({ line: Math.floor(line) - 1 });
    vscode.postMessage({ type: 'revealLine', line });
  });
});

document.addEventListener('dblclick', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-line]');
  if (!target) return;
  const line = Number(target.dataset.line);
  const el = elementForLine(main, line);
  el?.classList.add('mu-highlight-line');
  setTimeout(() => el?.classList.remove('mu-highlight-line'), 800);
  vscode.postMessage({ type: 'openLine', line });
});

document.addEventListener('click', (event) => {
  const anchor = (event.target as HTMLElement).closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href) return;
  event.preventDefault();
  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1));
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    return;
  }
  vscode.postMessage({ type: 'openLink', href });
});

vscode.postMessage({ type: 'ready' });
