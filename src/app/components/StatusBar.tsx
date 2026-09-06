import type { Diagnostic } from '../../markup/parser';
import { useUiStore } from '../state/uiStore';
import type { CursorInfo } from '../editor/EditorSurface';

export function StatusBar({ cursor, wordCount, diagnostics }: { cursor: CursorInfo; wordCount: number; diagnostics: Diagnostic[] }) {
  const problemsPanelOpen = useUiStore((s) => s.problemsPanelOpen);
  const setProblemsPanelOpen = useUiStore((s) => s.setProblemsPanelOpen);

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <div className="mu-status-bar">
      <span>
        Ln {cursor.line}, Col {cursor.column}
      </span>
      <span>{wordCount} palavras</span>
      <button
        className="mu-status-problems"
        data-has-problems={diagnostics.length > 0}
        onClick={() => setProblemsPanelOpen(!problemsPanelOpen)}
      >
        {diagnostics.length === 0 ? '● 0 problemas' : `● ${errors} erro(s), ${warnings} aviso(s)`}
      </button>
    </div>
  );
}
