import { useAppState, useWorkbench } from '../context.ts';
import { formatShortcut } from '../lib/keys.ts';
import type { SidebarView } from '../state/store.ts';
import { Explorer } from './Explorer.tsx';
import { OutlineView } from './OutlineView.tsx';
import { ProblemsView } from './ProblemsView.tsx';
import { SearchView } from './SearchView.tsx';
import { Splitter } from './Splitter.tsx';

const VIEWS: { view: SidebarView; label: string; shortcut: string }[] = [
  { view: 'explorer', label: 'Files', shortcut: 'mod+shift+e' },
  { view: 'search', label: 'Search', shortcut: 'mod+shift+f' },
  { view: 'outline', label: 'Outline', shortcut: 'mod+shift+u' },
  { view: 'problems', label: 'Problems', shortcut: 'mod+shift+m' },
];

export function Sidebar({ view }: { view: SidebarView }) {
  const { wb } = useWorkbench();
  const width = useAppState((s) => s.sidebarWidth);
  const problemCount = useAppState((s) =>
    Object.values(s.problems).reduce((n, p) => n + p.errors + p.warnings, 0),
  );
  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar">
        {VIEWS.map((v) => (
          <button
            key={v.view}
            type="button"
            role="tab"
            aria-selected={view === v.view}
            aria-controls="sidebar-panel"
            title={`${v.label} (${formatShortcut(v.shortcut)})`}
            onClick={() => wb.selectSidebar(v.view)}
          >
            {v.label}
            {v.view === 'problems' && problemCount > 0 && (
              <span className="sidebar-count">{problemCount > 99 ? '99+' : problemCount}</span>
            )}
          </button>
        ))}
      </div>
      <div className="sidebar-panel" id="sidebar-panel" role="tabpanel">
        {view === 'explorer' && <Explorer />}
        {view === 'search' && <SearchView />}
        {view === 'outline' && <OutlineView />}
        {view === 'problems' && <ProblemsView />}
      </div>
      <Splitter
        orientation="vertical"
        className="sidebar-splitter"
        onDrag={(x) => wb.setSidebarWidth(x)}
        onEnd={() => wb.persist()}
      />
    </aside>
  );
}

export function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="panel-header">
      <h2>{title}</h2>
      <div className="panel-actions">{children}</div>
    </header>
  );
}
