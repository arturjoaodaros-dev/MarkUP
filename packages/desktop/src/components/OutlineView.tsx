import { Box, Hash } from 'lucide-react';
import { useMemo } from 'react';
import { getSymbols, type DocumentSymbol } from '@markup-lang/language-service';
import { useAppState, useWorkbench } from '../context.ts';
import { editor } from '../editor/controller.ts';
import { PanelHeader } from './Sidebar.tsx';

export function OutlineView() {
  const { wb } = useWorkbench();
  const active = useAppState((s) => s.active);
  const content = useAppState((s) => (s.active ? s.docs[s.active]?.content : undefined));
  const cursorLine = useAppState((s) => s.cursor.line);
  const symbols = useMemo(
    () => (active && content !== undefined ? getSymbols(wb.service.analyze(content, active)) : []),
    [wb, active, content],
  );
  const lineIndex =
    active && content !== undefined ? wb.service.analyze(content, active).lineIndex : null;

  // The deepest symbol containing the cursor is highlighted.
  let current: DocumentSymbol | null = null;
  if (lineIndex) {
    const offset = lineIndex.offsetAt(cursorLine, 1);
    const find = (list: DocumentSymbol[]) => {
      for (const s of list) {
        if (s.from <= offset && offset <= s.to && s.kind !== 'frontMatter') {
          current = s;
          find(s.children);
        }
      }
    };
    find(symbols);
  }

  const render = (list: DocumentSymbol[], depth: number): React.ReactNode =>
    list.map((symbol, i) => (
      <div key={`${symbol.from}-${i}`}>
        <button
          type="button"
          className={`outline-row${symbol === current ? ' is-active' : ''}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => editor.select(symbol.selectionFrom)}
        >
          {symbol.kind === 'component' ? (
            <Box size={13} className="outline-icon is-component" />
          ) : (
            <Hash size={13} className="outline-icon" />
          )}
          <span className="tree-label">{symbol.name}</span>
          {symbol.kind === 'heading' && <span className="outline-detail">{symbol.detail}</span>}
        </button>
        {render(symbol.children, depth + 1)}
      </div>
    ));

  return (
    <section className="panel" aria-label="Outline">
      <PanelHeader title="Outline" />
      <div className="outline">
        {!active && <p className="panel-empty">Open a document to see its outline.</p>}
        {active && symbols.length === 0 && (
          <p className="panel-empty">No headings or components yet.</p>
        )}
        {render(
          symbols.filter((s) => s.kind !== 'frontMatter'),
          0,
        )}
      </div>
    </section>
  );
}
