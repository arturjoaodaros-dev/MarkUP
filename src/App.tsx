import { useEffect, useMemo, useState } from 'react';
import { ProblemsPanel } from './app/components/ProblemsPanel';
import { Sidebar } from './app/components/Sidebar';
import { StatusBar } from './app/components/StatusBar';
import { Toolbar } from './app/components/Toolbar';
import type { CursorInfo } from './app/editor/EditorSurface';
import { EditorSurface } from './app/editor/EditorSurface';
import { Preview } from './app/preview/Preview';
import { useDocumentsStore } from './app/state/documentsStore';
import { useUiStore } from './app/state/uiStore';
import { parse } from './markup/parser';

const PARSE_DEBOUNCE_MS = 120;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export default function App() {
  const activeId = useDocumentsStore((s) => s.activeId);
  const activeDoc = useDocumentsStore((s) => (s.activeId ? s.documents[s.activeId] : null));
  const updateContent = useDocumentsStore((s) => s.updateContent);

  const mode = useUiStore((s) => s.mode);
  const theme = useUiStore((s) => s.theme);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const problemsPanelOpen = useUiStore((s) => s.problemsPanelOpen);
  const setProblemsPanelOpen = useUiStore((s) => s.setProblemsPanelOpen);

  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1 });
  const [debouncedContent, setDebouncedContent] = useState(activeDoc?.content ?? '');

  // Reparse com debounce: o parser é síncrono e rápido, mas evitamos
  // recalcular a AST e re-renderizar o preview a cada tecla.
  useEffect(() => {
    const content = activeDoc?.content ?? '';
    const handle = setTimeout(() => setDebouncedContent(content), PARSE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [activeDoc?.content]);

  const { ast, diagnostics } = useMemo(() => parse(debouncedContent), [debouncedContent]);

  if (!activeDoc || !activeId) {
    return <div className="mu-app-empty">Nenhum documento aberto.</div>;
  }

  const wordCount = countWords(activeDoc.content);

  return (
    <div className={`mu-app mu-theme-${theme}`}>
      <Toolbar ast={ast} title={activeDoc.title} />
      <div className="mu-body">
        {sidebarOpen && <Sidebar ast={ast} />}
        <main className="mu-main" data-mode={mode}>
          {mode !== 'preview' && (
            <div className="mu-pane mu-pane-editor">
              <EditorSurface
                key={activeId}
                value={activeDoc.content}
                onChange={(value) => updateContent(activeId, value)}
                diagnostics={diagnostics}
                theme={theme}
                onCursorChange={setCursor}
              />
            </div>
          )}
          {mode !== 'edit' && (
            <div className="mu-pane mu-pane-preview">
              <Preview ast={ast} />
            </div>
          )}
        </main>
      </div>
      {problemsPanelOpen && <ProblemsPanel diagnostics={diagnostics} onClose={() => setProblemsPanelOpen(false)} />}
      <StatusBar cursor={cursor} wordCount={wordCount} diagnostics={diagnostics} />
    </div>
  );
}
