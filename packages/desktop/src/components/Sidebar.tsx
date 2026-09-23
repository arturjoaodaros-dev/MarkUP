import { useWorkbench } from '../context.ts';
import type { SidebarView } from '../state/store.ts';
import { Explorer } from './Explorer.tsx';
import { OutlineView } from './OutlineView.tsx';
import { ProblemsView } from './ProblemsView.tsx';
import { SearchView } from './SearchView.tsx';
import { Splitter } from './Splitter.tsx';
import { useAppState } from '../context.ts';

export function Sidebar({ view }: { view: SidebarView }) {
  const { wb } = useWorkbench();
  const width = useAppState((s) => s.sidebarWidth);
  return (
    <aside className="sidebar" style={{ width }}>
      {view === 'explorer' && <Explorer />}
      {view === 'search' && <SearchView />}
      {view === 'outline' && <OutlineView />}
      {view === 'problems' && <ProblemsView />}
      <Splitter
        orientation="vertical"
        className="sidebar-splitter"
        onDrag={(x) => wb.setSidebarWidth(x - 44)}
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
