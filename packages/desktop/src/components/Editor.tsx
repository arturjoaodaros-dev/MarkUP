import { useEffect, useRef, type CSSProperties } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { basicSetup } from 'codemirror';
import { markupLanguageExtensions } from '../editor/markupLanguage';
import { useAppStore } from '../state/appStore';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

function themeExtension(fontSize: number, fontFamily: string) {
  return EditorView.theme({
    '&': { fontSize: `${fontSize}px` },
    '.cm-content, .cm-gutters': { fontFamily },
  });
}

function indentExtension(tabSize: number) {
  return [indentUnit.of(' '.repeat(tabSize)), EditorState.tabSize.of(tabSize)];
}

/**
 * Editor CodeMirror 6. O documento (protagonista — missão §8): sem caixa,
 * canvas contínuo, `basicSetup` já dá números de linha discretos,
 * histórico de undo/redo e seleção — nada disso precisa ser reinventado.
 *
 * Fonte/wrap/indentação são reconfiguráveis em runtime via `Compartment`
 * (API oficial do CodeMirror 6 pra isso) — evita remontar a view inteira
 * (e perder histórico de undo) toda vez que uma configuração do editor
 * muda na tela de Configurações. Números de linha são alternados via CSS
 * (esconde `.cm-gutters`) em vez de reconstruir o `basicSetup` só por
 * isso — mais simples e o efeito visual/funcional é o mesmo.
 */
export function Editor({ value, onChange, onSave }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const editorSettings = useAppStore((s) => s.settings.editor);
  const settingsRef = useRef(editorSettings);
  settingsRef.current = editorSettings;

  const themeCompartment = useRef(new Compartment()).current;
  const wrapCompartment = useRef(new Compartment()).current;
  const indentCompartment = useRef(new Compartment()).current;

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      doc: value,
      parent: containerRef.current,
      extensions: [
        basicSetup,
        ...markupLanguageExtensions(),
        themeCompartment.of(themeExtension(settingsRef.current.fontSize, settingsRef.current.fontFamily)),
        wrapCompartment.of(settingsRef.current.wordWrap ? EditorView.lineWrapping : []),
        indentCompartment.of(indentExtension(settingsRef.current.tabSize)),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              onSaveRef.current();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Monta uma vez só; troca de aba é tratada pelo efeito abaixo, não por remontagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `value` muda quando o usuário troca de aba (o buffer de outro
  // documento) — sincroniza o conteúdo sem destruir/recriar a view, pra não
  // perder o histórico de undo à toa em trocas normais de digitação.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(themeExtension(editorSettings.fontSize, editorSettings.fontFamily)),
    });
  }, [editorSettings.fontSize, editorSettings.fontFamily, themeCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(editorSettings.wordWrap ? EditorView.lineWrapping : []),
    });
  }, [editorSettings.wordWrap, wrapCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: indentCompartment.reconfigure(indentExtension(editorSettings.tabSize)) });
  }, [editorSettings.tabSize, indentCompartment]);

  const style: CSSProperties | undefined = editorSettings.maxWidth
    ? ({ '--mkd-editor-max-width': `${editorSettings.maxWidth}px` } as CSSProperties)
    : undefined;

  return (
    <div
      className="mkd-editor-pane"
      ref={containerRef}
      data-line-numbers={editorSettings.lineNumbers}
      style={style}
    />
  );
}
