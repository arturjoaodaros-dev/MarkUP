/**
 * The MarkUP language in CodeMirror — entirely driven by the shared language
 * service, so highlighting, errors, completion, hover and folding match the
 * parser, the CLI and VS Code exactly.
 */
import { autocompletion, completionKeymap, snippet, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { foldService } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { StateEffect, type Extension } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip, keymap, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { markupToHtml } from '@markup-lang/html';
import {
  getCompletions,
  getDefinition,
  getFoldingRanges,
  getHighlights,
  getHover,
  type Analysis,
  type CompletionKind,
  type LanguageService,
} from '@markup-lang/language-service';
import { toCodeMirrorSnippet } from './snippets.ts';

export interface MarkupEditorOptions {
  service: LanguageService;
  /** Key of the current document in the service cache (its path). */
  documentKey: () => string;
  onNavigate?: (from: number, to: number) => void;
  onMessage?: (message: string) => void;
}

const LARGE_DOCUMENT = 120_000;
const rebuild = StateEffect.define<null>();

function analyze(view: EditorView, options: MarkupEditorOptions): Analysis {
  return options.service.analyze(view.state.doc.toString(), options.documentKey());
}

// ---------------------------------------------------------------------------
// Highlighting

const lineClasses: Record<string, string> = {
  codeBlock: 'cm-mu-code-line',
  frontMatter: 'cm-mu-frontmatter-line',
};

function buildDecorations(view: EditorView, options: MarkupEditorOptions): DecorationSet {
  const analysis = analyze(view, options);
  const doc = view.state.doc;
  const ranges = [];
  for (const h of getHighlights(analysis)) {
    if (h.to > doc.length) continue;
    const lineClass = lineClasses[h.kind];
    if (lineClass) {
      const first = doc.lineAt(h.from).number;
      const last = doc.lineAt(h.to).number;
      for (let n = first; n <= last; n++) ranges.push(Decoration.line({ class: lineClass }).range(doc.line(n).from));
      continue;
    }
    if (h.kind === 'heading') {
      const node = doc.lineAt(h.from);
      const level = /^\s*(#{1,6})/.exec(node.text)?.[1]?.length;
      ranges.push(Decoration.line({ class: `cm-mu-heading-line${level ? ` cm-mu-h${level}` : ''}` }).range(node.from));
    }
    ranges.push(Decoration.mark({ class: `cm-mu-${h.kind}` }).range(h.from, h.to));
  }
  return Decoration.set(ranges, true);
}

function highlighter(options: MarkupEditorOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private timer: ReturnType<typeof setTimeout> | undefined;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, options);
      }

      update(update: ViewUpdate) {
        const forced = update.transactions.some((t) => t.effects.some((e) => e.is(rebuild)));
        if (!update.docChanged && !forced) return;
        if (forced || update.state.doc.length < LARGE_DOCUMENT) {
          this.decorations = buildDecorations(update.view, options);
          return;
        }
        // Large documents: keep typing smooth, re-highlight when the author pauses.
        this.decorations = this.decorations.map(update.changes);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => update.view.dispatch({ effects: rebuild.of(null) }), 200);
      }

      destroy() {
        clearTimeout(this.timer);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

// ---------------------------------------------------------------------------
// Diagnostics

function diagnostics(options: MarkupEditorOptions): Extension {
  return [
    linter(
      (view) => {
        const analysis = analyze(view, options);
        const length = view.state.doc.length;
        return analysis.diagnostics.map(
          (d): CmDiagnostic => ({
            from: Math.min(d.range.start.offset, length),
            to: Math.min(Math.max(d.range.end.offset, d.range.start.offset), length),
            severity: d.severity === 'hint' ? 'hint' : d.severity,
            source: d.code,
            message: d.message,
            actions: (d.fixes ?? []).map((fix) => ({
              name: fix.title,
              apply(v: EditorView) {
                v.dispatch({ changes: fix.edits.map((e) => ({ from: e.range.start.offset, to: e.range.end.offset, insert: e.newText })) });
              },
            })),
          }),
        );
      },
      { delay: 250 },
    ),
    lintGutter(),
  ];
}

/** Ctrl+. — apply the preferred fix of the problem under the cursor. */
export function quickFix(view: EditorView, options: MarkupEditorOptions): boolean {
  const analysis = analyze(view, options);
  const pos = view.state.selection.main.head;
  const candidates = analysis.diagnostics.filter((d) => d.fixes?.length && d.range.start.offset <= pos && pos <= d.range.end.offset);
  const diagnostic = candidates[0];
  if (!diagnostic) {
    options.onMessage?.('No quick fix here.');
    return true;
  }
  const fix = diagnostic.fixes!.find((f) => f.preferred) ?? diagnostic.fixes![0]!;
  view.dispatch({ changes: fix.edits.map((e) => ({ from: e.range.start.offset, to: e.range.end.offset, insert: e.newText })) });
  options.onMessage?.(fix.title);
  return true;
}

// ---------------------------------------------------------------------------
// Completion

const COMPLETION_TYPES: Record<CompletionKind, string> = {
  component: 'class',
  attribute: 'property',
  value: 'enum',
  key: 'property',
  anchor: 'variable',
  language: 'keyword',
  footnote: 'variable',
  snippet: 'text',
};

function completionSource(options: MarkupEditorOptions) {
  return (context: CompletionContext): CompletionResult | null => {
    const analysis = options.service.analyze(context.state.doc.toString(), options.documentKey());
    const result = getCompletions(analysis, context.pos);
    if (!result || result.items.length === 0) return null;
    // Filter on the word only (not the `:::` in front of it); replace the whole range.
    const replaced = context.state.sliceDoc(result.from, result.to);
    const from = result.from + (/^[^A-Za-z0-9_]*/.exec(replaced)?.[0].length ?? 0);
    return {
      from,
      to: result.to,
      options: result.items.map(
        (item): Completion => ({
          label: item.label,
          type: COMPLETION_TYPES[item.kind],
          detail: item.detail,
          boost: item.sortText?.startsWith('0') ? 1 : 0,
          info: item.documentation ? () => docElement(item.documentation!) : undefined,
          apply: (view, completion, _from, to) => {
            if (item.snippet) snippet(toCodeMirrorSnippet(item.insertText))(view, completion, result.from, to);
            else view.dispatch({ changes: { from: result.from, to, insert: item.insertText }, selection: { anchor: result.from + item.insertText.length } });
          },
        }),
      ),
      validFor: /^[\w-]*$/,
    };
  };
}

function docElement(markdown: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cm-mu-doc markup-body';
  // The docs are Markdown, which MarkUP renders safely (no raw HTML).
  el.innerHTML = markupToHtml(markdown, { headingAnchors: false, validate: false }).html;
  return el;
}

// ---------------------------------------------------------------------------
// Hover, folding, navigation

function hover(options: MarkupEditorOptions): Extension {
  return hoverTooltip((view, pos) => {
    const info = getHover(analyze(view, options), pos);
    if (!info) return null;
    return { pos: info.from, end: info.to, above: true, create: () => ({ dom: docElement(info.contents) }) };
  }, { hoverTime: 350 });
}

function folding(options: MarkupEditorOptions): Extension {
  let cache: { text: string; ends: Map<number, number> } | null = null;
  return foldService.of((state, lineStart) => {
    const text = state.doc.toString();
    if (!cache || cache.text !== text) {
      const ends = new Map<number, number>();
      const analysis = options.service.analyze(text, options.documentKey());
      for (const range of getFoldingRanges(analysis)) {
        if (range.endLine > state.doc.lines) continue;
        const start = state.doc.line(range.startLine);
        const end = state.doc.line(range.endLine);
        if (!ends.has(start.from) || end.to > ends.get(start.from)!) ends.set(start.from, end.to);
      }
      cache = { text, ends };
    }
    const end = cache.ends.get(lineStart);
    if (end === undefined) return null;
    return { from: state.doc.lineAt(lineStart).to, to: end };
  });
}

export function goToDefinition(view: EditorView, options: MarkupEditorOptions, pos = view.state.selection.main.head): boolean {
  const location = getDefinition(analyze(view, options), pos);
  if (!location) {
    options.onMessage?.('No definition found.');
    return true;
  }
  options.onNavigate?.(location.from, location.to);
  return true;
}

function navigation(options: MarkupEditorOptions): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const location = getDefinition(analyze(view, options), pos);
      if (!location) return false;
      event.preventDefault();
      options.onNavigate?.(location.from, location.to);
      return true;
    },
  });
}

export function markupLanguage(options: MarkupEditorOptions): Extension {
  return [
    highlighter(options),
    diagnostics(options),
    autocompletion({ override: [completionSource(options)], icons: true, activateOnTyping: true, closeOnBlur: true, maxRenderedOptions: 80 }),
    keymap.of([
      ...completionKeymap,
      { key: 'Mod-.', run: (view) => quickFix(view, options) },
      { key: 'F12', run: (view) => goToDefinition(view, options) },
    ]),
    hover(options),
    folding(options),
    navigation(options),
  ];
}
