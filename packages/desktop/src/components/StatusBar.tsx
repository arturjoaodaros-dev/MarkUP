import { CircleX, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { countWords, renderText } from '@markup-lang/text';
import { useAppState, useWorkbench } from '../context.ts';
import { relative } from '../fs/types.ts';
import { isDirty } from '../state/store.ts';

export function StatusBar() {
  const { wb } = useWorkbench();
  const workspace = useAppState((s) => s.workspace);
  const active = useAppState((s) => s.active);
  const content = useAppState((s) => (s.active ? s.docs[s.active]?.content : undefined));
  const dirty = useAppState((s) => (s.active ? isDirty(s.docs[s.active]) : false));
  const cursor = useAppState((s) => s.cursor);
  const problems = useAppState((s) => s.problems);

  const totals = Object.values(problems).reduce(
    (t, p) => ({ errors: t.errors + p.errors, warnings: t.warnings + p.warnings }),
    { errors: 0, warnings: 0 },
  );
  // Words of the rendered text (so markup syntax is not counted).
  const words = useMemo(() => {
    if (!active || content === undefined) return 0;
    try {
      return countWords(renderText(wb.service.analyze(content, active).document));
    } catch {
      return 0;
    }
  }, [wb, active, content]);
  const eol = content?.includes('\r\n') ? 'CRLF' : 'LF';

  return (
    <footer className="status-bar">
      <div className="status-left">
        {workspace && <span className="status-item is-strong">{workspace.name}</span>}
        {active && workspace && (
          <span className="status-item is-muted" title={active}>
            {relative(workspace.root, active)}
            {dirty ? ' •' : ''}
          </span>
        )}
      </div>
      <div className="status-right">
        {workspace && (
          <button
            type="button"
            className="status-item status-button"
            title="Problems"
            onClick={() => wb.showSidebar('problems')}
          >
            <CircleX size={13} className={totals.errors ? 'sev-error' : ''} /> {totals.errors}
            <TriangleAlert size={13} className={totals.warnings ? 'sev-warning' : ''} />{' '}
            {totals.warnings}
          </button>
        )}
        {active && (
          <>
            <button
              type="button"
              className="status-item status-button"
              title="Go to line"
              onClick={() => wb.openPalette('line')}
            >
              Ln {cursor.line}, Col {cursor.column}
              {cursor.selected > 0 ? ` (${cursor.selected} selected)` : ''}
            </button>
            <span className="status-item">{words.toLocaleString()} words</span>
            <span className="status-item">{eol}</span>
            <span className="status-item">MarkUP</span>
          </>
        )}
      </div>
    </footer>
  );
}
