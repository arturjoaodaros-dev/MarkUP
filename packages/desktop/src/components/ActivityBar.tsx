import { CircleAlert, Files, ListTree, Search, Settings } from 'lucide-react';
import { useAppState, useWorkbench } from '../context.ts';
import { formatShortcut } from '../lib/keys.ts';
import type { SidebarView } from '../state/store.ts';

const ITEMS: { view: SidebarView; label: string; icon: typeof Files; shortcut: string }[] = [
  { view: 'explorer', label: 'Explorer', icon: Files, shortcut: 'mod+shift+e' },
  { view: 'search', label: 'Search', icon: Search, shortcut: 'mod+shift+f' },
  { view: 'outline', label: 'Outline', icon: ListTree, shortcut: 'mod+shift+u' },
  { view: 'problems', label: 'Problems', icon: CircleAlert, shortcut: 'mod+shift+m' },
];

export function ActivityBar() {
  const { wb } = useWorkbench();
  const sidebar = useAppState((s) => s.sidebar);
  const hasWorkspace = useAppState((s) => s.workspace !== null);
  const problemCount = useAppState((s) => Object.values(s.problems).reduce((n, p) => n + p.errors + p.warnings, 0));

  return (
    <nav className="activity-bar" aria-label="Views">
      {ITEMS.map(({ view, label, icon: Icon, shortcut }) => (
        <button
          key={view}
          type="button"
          className="activity-item"
          aria-pressed={sidebar === view}
          aria-label={label}
          title={`${label} (${formatShortcut(shortcut)})`}
          disabled={!hasWorkspace}
          onClick={() => wb.showSidebar(view)}
        >
          <Icon size={20} strokeWidth={1.6} />
          {view === 'problems' && problemCount > 0 && <span className="activity-badge">{problemCount > 99 ? '99+' : problemCount}</span>}
        </button>
      ))}
      <div className="activity-spacer" />
      <button type="button" className="activity-item" aria-label="Settings" title={`Settings (${formatShortcut('mod+,')})`} onClick={() => wb.store.set({ settingsOpen: true })}>
        <Settings size={20} strokeWidth={1.6} />
      </button>
    </nav>
  );
}
