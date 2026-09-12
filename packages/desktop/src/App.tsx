import { useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { useAppStore, startPeriodicReconciliation } from './state/appStore';
import { ActivityRail } from './components/ActivityRail';
import { FileExplorer } from './components/FileExplorer';
import { TabStrip } from './components/TabStrip';
import { Editor } from './components/Editor';
import { PreviewPane } from './components/PreviewPane';
import { StatusBar } from './components/StatusBar';
import { Notifications } from './components/Notifications';
import { CommandPalette } from './components/CommandPalette';
import { SearchDialog } from './components/SearchDialog';
import { Settings } from './components/Settings';
import {
  CloseTabConfirmDialog,
  ConflictDialog,
  DeleteConfirmDialog,
  NewDocumentDialog,
  RenameDialog,
} from './components/Dialogs';

export function App() {
  const workspace = useAppStore((s) => s.workspace);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const theme = useAppStore((s) => s.resolvedTheme);
  const previewSettings = useAppStore((s) => s.settings.preview);
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);
  const isPreviewCollapsed = useAppStore((s) => s.isPreviewCollapsed);
  const updateTabText = useAppStore((s) => s.updateTabText);
  const saveTab = useAppStore((s) => s.saveTab);
  const requestCloseTab = useAppStore((s) => s.requestCloseTab);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const openFolderPicker = useAppStore((s) => s.openFolderPicker);
  const restoreLastWorkspace = useAppStore((s) => s.restoreLastWorkspace);
  const openDocument = useAppStore((s) => s.openDocument);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void restoreLastWorkspace();
    return startPeriodicReconciliation();
    // Roda uma vez, na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.shiftKey && key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!e.shiftKey && key === 's') {
        e.preventDefault();
        if (activeTabId) void saveTab(activeTabId);
      } else if (!e.shiftKey && key === 'w') {
        e.preventDefault();
        if (activeTabId) requestCloseTab(activeTabId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTabId, requestCloseTab, saveTab, setCommandPaletteOpen, setSearchOpen]);

  return (
    <div className="mkd-app">
      <div className="mkd-workspace">
        <ActivityRail />
        {workspace ? (
          <>
            <div className="mkd-sidebar" data-collapsed={isSidebarCollapsed}>
              <div className="mkd-sidebar-header">
                <span>Explorer</span>
                <button
                  className="mkd-sidebar-action"
                  title="Abrir outra pasta..."
                  onClick={() => void openFolderPicker()}
                >
                  <FolderOpen size={14} />
                </button>
              </div>
              <FileExplorer
                workspace={workspace}
                activeFilePath={activeTab?.filePath ?? null}
                onOpenFile={(path) => void openDocument(path)}
              />
            </div>
            <div className="mkd-main">
              <TabStrip tabs={tabs} activeTabId={activeTabId} />
              <div className="mkd-panes">
                {activeTab ? (
                  <>
                    <Editor
                      value={activeTab.text}
                      onChange={(text) => updateTabText(activeTab.id, text)}
                      onSave={() => void saveTab(activeTab.id)}
                    />
                    <div className="mkd-pane-divider" />
                    <PreviewPane
                      source={previewSettings.updateMode === 'onSave' ? activeTab.savedText : activeTab.text}
                      collapsed={isPreviewCollapsed}
                      tabId={activeTab.id}
                      updateMode={previewSettings.updateMode}
                      maxWidth={previewSettings.maxWidth}
                    />
                  </>
                ) : (
                  <div className="mkd-empty-workspace">
                    <h1>Nenhum documento aberto</h1>
                    <p>Selecione um documento na árvore à esquerda, ou crie um novo.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="mkd-empty-workspace" style={{ flex: 1 }}>
            <h1>Nenhum workspace aberto</h1>
            <p>Abra uma pasta para começar a trabalhar com seus documentos MarkUP.</p>
            <button className="mkd-button" onClick={() => void openFolderPicker()}>
              Abrir Pasta...
            </button>
          </div>
        )}
      </div>

      <StatusBar rootPath={workspace?.rootPath ?? null} activeText={activeTab?.text ?? null} />
      <Notifications />
      <CommandPalette />
      <SearchDialog />
      <Settings />
      <NewDocumentDialog />
      <RenameDialog />
      <DeleteConfirmDialog />
      <CloseTabConfirmDialog />
      <ConflictDialog />
    </div>
  );
}
