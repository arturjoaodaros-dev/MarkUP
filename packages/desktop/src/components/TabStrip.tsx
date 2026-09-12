import { X } from 'lucide-react';
import { useAppStore, type DocumentTab } from '../state/appStore';

function fileNameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

/** Tira de abas compacta (missão §12) — indicador sutil na ativa, "×" só no hover, overflow com scroll horizontal. */
export function TabStrip({ tabs, activeTabId }: { tabs: DocumentTab[]; activeTabId: string | null }) {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const requestCloseTab = useAppStore((s) => s.requestCloseTab);

  if (tabs.length === 0) return <div className="mkd-tabstrip" />;

  return (
    <div className="mkd-tabstrip">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="mkd-tab"
          data-active={tab.id === activeTabId}
          onClick={() => setActiveTab(tab.id)}
        >
          <span>{fileNameOf(tab.filePath)}</span>
          {tab.isDirty && <span className="mkd-tab-dirty-dot" />}
          <span
            className="mkd-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              requestCloseTab(tab.id);
            }}
          >
            <X size={13} />
          </span>
        </div>
      ))}
    </div>
  );
}
