import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { useAppState, useWorkbench } from '../context.ts';
import { editor, scrollToLine, topVisibleLine } from '../editor/controller.ts';
import { markupLanguage } from '../editor/extensions.ts';
import { scrollBus } from '../lib/scroll-bus.ts';
import type { Settings } from '../state/settings.ts';

const settingsCompartment = new Compartment();

function settingsExtensions(settings: Settings): Extension {
  return [
    settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
    settings.wordWrap ? EditorView.lineWrapping : [],
    EditorState.tabSize.of(settings.tabSize),
    indentUnit.of(' '.repeat(settings.tabSize)),
  ];
}

/**
 * One CodeMirror view for all tabs. Each document keeps its own EditorState
 * (undo history, selection, folds), swapped in when its tab becomes active.
 */
export function EditorPane() {
  const { wb } = useWorkbench();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const current = useRef<string | null>(null);
  const active = useAppState((s) => s.active);
  const content = useAppState((s) => (s.active ? s.docs[s.active]?.content : undefined));
  const settings = useAppState((s) => s.settings);
  const openTabs = useAppState((s) => s.tabs);

  const createState = (path: string, text: string) =>
    EditorState.create({
      doc: text,
      extensions: [
        settingsCompartment.of(settingsExtensions(wb.state.settings)),
        highlightSpecialChars(),
        history(),
        foldGutter({ openText: '⌄', closedText: '›' }),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        markupLanguage({
          service: wb.service,
          documentKey: () => path,
          onNavigate: (from, to) => editor.select(from, to),
          onMessage: (text) => wb.toast('info', text),
        }),
        EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': `Editor: ${path}` }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) wb.setContent(path, update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            const selected = update.state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
            wb.store.set({ cursor: { line: line.number, column: head - line.from + 1, selected } });
          }
        }),
      ],
    });

  // Create the view once.
  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    editor.view = v;
    const onScroll = () => {
      if (wb.state.settings.scrollSync) scrollBus.publish('editor', topVisibleLine(v));
    };
    v.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    const unsubscribe = scrollBus.subscribe('editor', (line) => {
      if (wb.state.settings.scrollSync) scrollToLine(v, line);
    });
    return () => {
      unsubscribe();
      v.scrollDOM.removeEventListener('scroll', onScroll);
      v.destroy();
      if (editor.view === v) editor.view = null;
      view.current = null;
      current.current = null;
    };
  }, [wb]);

  // Switch documents.
  useEffect(() => {
    const v = view.current;
    if (!v || !active || content === undefined) return;
    if (current.current !== active) {
      if (current.current) states.current.set(current.current, v.state);
      let next = states.current.get(active);
      if (!next || next.doc.toString() !== content) next = createState(active, content);
      v.setState(next);
      v.dispatch({
        effects: settingsCompartment.reconfigure(settingsExtensions(wb.state.settings)),
      });
      current.current = active;
      requestAnimationFrame(() => v.focus());
      return;
    }
    // The document changed outside the editor (reload from disk, rename).
    if (v.state.doc.toString() !== content) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: content } });
    }
  }, [active, content, wb]);

  // Forget states of closed tabs.
  useEffect(() => {
    for (const path of states.current.keys())
      if (!openTabs.includes(path)) states.current.delete(path);
  }, [openTabs]);

  useEffect(() => {
    view.current?.dispatch({
      effects: settingsCompartment.reconfigure(settingsExtensions(settings)),
    });
  }, [settings]);

  return <div ref={host} className="editor-host" />;
}
