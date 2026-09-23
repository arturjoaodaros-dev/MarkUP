import { foldAll, unfoldAll } from '@codemirror/language';
import { openSearchPanel } from '@codemirror/search';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { snippet } from '@codemirror/autocomplete';
import { toCodeMirrorSnippet } from './snippets.ts';

/** The (fractional, 1-based) source line at the top of the editor viewport. */
export function topVisibleLine(view: EditorView): number {
  const height = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const block = view.lineBlockAtHeight(Math.max(0, height));
  const line = view.state.doc.lineAt(block.from).number;
  const within =
    block.height > 0 ? Math.min(1, Math.max(0, (height - block.top) / block.height)) : 0;
  return line + within;
}

/** Scrolls so that source line `line` (fractional) is at the top of the viewport. */
export function scrollToLine(view: EditorView, line: number): void {
  const doc = view.state.doc;
  const whole = Math.min(Math.max(1, Math.floor(line)), doc.lines);
  const block = view.lineBlockAt(doc.line(whole).from);
  const top = block.top + (line - whole) * block.height;
  view.scrollDOM.scrollTop =
    top +
    (view.documentTop - view.scrollDOM.getBoundingClientRect().top) +
    view.scrollDOM.scrollTop;
}

/** A handle on the live editor for commands that are not typed into it. */
export const editor = {
  view: null as EditorView | null,

  focus(): void {
    this.view?.focus();
  },

  gotoLine(line: number, column = 1): void {
    const view = this.view;
    if (!view) return;
    const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    const pos = Math.min(target.from + Math.max(0, column - 1), target.to);
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    view.focus();
  },

  select(from: number, to = from): void {
    const view = this.view;
    if (!view) return;
    const max = view.state.doc.length;
    const a = Math.min(from, max);
    const b = Math.min(to, max);
    view.dispatch({
      selection: EditorSelection.range(a, b),
      effects: EditorView.scrollIntoView(a, { y: 'center' }),
    });
    view.focus();
  },

  /** Inserts an LSP-style snippet at the cursor, on its own line for block components. */
  insertSnippet(template: string, block: boolean): void {
    const view = this.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const prefix =
      block && from > line.from + (/^\s*/.exec(line.text)?.[0].length ?? 0) ? '\n' : '';
    snippet(prefix + toCodeMirrorSnippet(template))(view, { label: 'component' }, from, to);
    view.focus();
  },

  find(): void {
    if (this.view) openSearchPanel(this.view);
  },

  foldAll(): void {
    if (this.view) foldAll(this.view);
  },

  unfoldAll(): void {
    if (this.view) unfoldAll(this.view);
  },

  topLine(): number {
    const view = this.view;
    if (!view) return 1;
    return topVisibleLine(view);
  },
};
