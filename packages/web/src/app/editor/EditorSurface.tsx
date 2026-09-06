// Integração com o CodeMirror 6, isolada atrás desta única superfície.
// Nenhum outro lugar da aplicação importa `@codemirror/*` diretamente — se
// um dia o editor precisar trocar (por um textarea simples, por exemplo),
// este é o único arquivo que muda.

import { indentWithTab, history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { StreamLanguage, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { forceLinting, lintGutter, linter } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { Diagnostic } from '../../markup/parser';
import { markupStreamParser } from './markupLanguage';

export interface CursorInfo {
  line: number;
  column: number;
}

interface EditorSurfaceProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  theme: 'light' | 'dark';
  onCursorChange?: (info: CursorInfo) => void;
}

const themeCompartment = new Compartment();

function toCmSeverity(sev: Diagnostic['severity']): CmDiagnostic['severity'] {
  return sev === 'error' ? 'error' : 'warning';
}

const darkTheme = EditorView.theme(
  {
    '&': { color: 'var(--mu-text)', backgroundColor: 'var(--mu-bg)' },
    '.cm-content': { caretColor: 'var(--mu-accent)' },
    '.cm-gutters': { backgroundColor: 'var(--mu-bg)', color: 'var(--mu-text-muted)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'var(--mu-bg-subtle)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--mu-bg-subtle)' },
  },
  { dark: true },
);

const lightTheme = EditorView.theme({
  '&': { color: 'var(--mu-text)', backgroundColor: 'var(--mu-bg)' },
  '.cm-content': { caretColor: 'var(--mu-accent)' },
  '.cm-gutters': { backgroundColor: 'var(--mu-bg)', color: 'var(--mu-text-muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--mu-bg-subtle)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--mu-bg-subtle)' },
});

export function EditorSurface({ value, onChange, diagnostics, theme, onCursorChange }: EditorSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const diagnosticsRef = useRef<Diagnostic[]>(diagnostics);
  const lastEmitted = useRef<string>(value);

  useEffect(() => {
    if (!hostRef.current) return;

    const lintSource = () =>
      diagnosticsRef.current.map((d): CmDiagnostic => ({
        from: d.position.start.offset,
        to: Math.max(d.position.end.offset, d.position.start.offset + 1),
        severity: toCmSeverity(d.severity),
        message: d.message,
      }));

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        StreamLanguage.define(markupStreamParser),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        lintGutter(),
        linter(lintSource, { delay: 300 }),
        themeCompartment.of(theme === 'dark' ? darkTheme : lightTheme),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            lastEmitted.current = text;
            onChange(text);
          }
          if ((update.docChanged || update.selectionSet) && onCursorChange) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            onCursorChange({ line: line.number, column: pos - line.from + 1 });
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Recriado apenas na montagem — trocas de documento são aplicadas via
    // dispatch abaixo, não recriando a view (isso preservaria o histórico
    // de undo entre documentos, então usamos uma key externa por documento).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza conteúdo externo (troca de documento, carregar template) sem
  // reemitir onChange nem perder a posição do cursor em edições normais.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    diagnosticsRef.current = diagnostics;
    if (viewRef.current) forceLinting(viewRef.current);
  }, [diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(theme === 'dark' ? darkTheme : lightTheme) });
  }, [theme]);

  return <div className="mu-editor-surface" ref={hostRef} />;
}
