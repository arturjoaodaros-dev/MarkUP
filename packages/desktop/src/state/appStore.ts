// Orquestrador central: workspace, abas, notificações, tema, configurações,
// busca. Porta conceitual de packages/desktop/ViewModels/AppViewModel.cs
// (fase WPF), mas modelado como estado imutável de Zustand em vez de
// INotifyPropertyChanged — diálogos de confirmação (fechar aba suja,
// conflito externo) viram estado reativo (`pendingCloseTabId`/
// `pendingConflict`) em vez de chamadas bloqueantes de MessageBox, porque
// React não tem equivalente síncrono.

import { create } from 'zustand';
import type { WorkspaceChange, WorkspaceIndexState } from './workspaceTypes';
import {
  applyBatch,
  getFileList,
  reconcileWithFreshScan,
  resolveWikiLink as resolveWikiLinkInIndex,
} from './workspaceIndex';
import { scanWorkspace } from './workspaceScan';
import { WorkspaceChangeCoalescer } from './workspaceChangeCoalescer';
import { onWorkspaceChanged, startWatching, stopWatching } from '../fs/watcherBridge';
import { createDocument, readDocument, writeDocumentAtomic } from '../fs/atomicWrite';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
  type EditorSettings,
  type FilesSettings,
  type MarkupSettings,
  type PreviewSettings,
  type ThemePreference,
} from '../fs/settings';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { exists, remove, rename as renamePath } from '@tauri-apps/plugin-fs';
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  severity: NotificationSeverity;
  message: string;
}

export interface DocumentTab {
  id: string; // == filePath, único por documento aberto
  filePath: string;
  text: string;
  /** Conteúdo tal como está em disco (última leitura ou salvamento) — usado pelo preview no modo "atualizar ao salvar". */
  savedText: string;
  isDirty: boolean;
  isExternallyDeleted: boolean;
}

interface SettingsGroups {
  editor: EditorSettings;
  preview: PreviewSettings;
  files: FilesSettings;
  markup: MarkupSettings;
}

interface AppState {
  workspace: WorkspaceIndexState | null;
  lastWorkspacePath: string | null;
  tabs: DocumentTab[];
  activeTabId: string | null;
  notifications: Notification[];
  themePreference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  settings: SettingsGroups;
  searchQuery: string;
  isSidebarCollapsed: boolean;
  isPreviewCollapsed: boolean;
  isSettingsOpen: boolean;
  pendingCloseTabId: string | null;
  pendingConflict: { tabId: string; externalText: string } | null;
  pendingDeletePath: string | null;
  pendingRenamePath: string | null;
  isCommandPaletteOpen: boolean;
  isSearchOpen: boolean;
  isNewDocumentDialogOpen: boolean;

  openWorkspace: (path: string) => Promise<void>;
  openFolderPicker: () => Promise<void>;
  restoreLastWorkspace: () => Promise<void>;
  openDocument: (path: string) => Promise<void>;
  createNewDocument: (fileName: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  updateTabText: (tabId: string, text: string) => void;
  saveTab: (tabId: string) => Promise<void>;
  requestCloseTab: (tabId: string) => void;
  confirmCloseTab: (choice: 'save' | 'discard' | 'cancel') => Promise<void>;
  resolveConflictKeepExternal: () => void;
  resolveConflictKeepMine: () => void;
  requestDelete: (path: string) => void;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;
  requestRename: (path: string) => void;
  confirmRename: (newName: string) => Promise<void>;
  cancelRename: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setNewDocumentDialogOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setThemePreference: (pref: ThemePreference) => void;
  toggleSidebar: () => void;
  togglePreview: () => void;
  updateEditorSettings: (patch: Partial<EditorSettings>) => void;
  updatePreviewSettings: (patch: Partial<PreviewSettings>) => void;
  updateFilesSettings: (patch: Partial<FilesSettings>) => void;
  updateMarkupSettings: (patch: Partial<MarkupSettings>) => void;
  setSearchQuery: (query: string) => void;
  notify: (severity: NotificationSeverity, message: string, autoDismiss?: boolean) => void;
  dismissNotification: (id: string) => void;
  resolveWikiLink: (target: string) => { exists: boolean; href?: string };
  fileList: () => { name: string; path: string }[];
}

// Fora do estado do Zustand de propósito — não é algo que a UI observa
// diretamente, só a lógica interna de supressão de auto-loop de save
// (mesmo padrão do C#, missão §14) e os timers de autosave/persistência.
const selfWrites = new Map<string, number>();
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const coalescer = new WorkspaceChangeCoalescer();
let unlistenWorkspaceChanged: UnlistenFn | null = null;
let notificationCounter = 0;
let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let themeWatcherRegistered = false;

function newNotificationId(): string {
  notificationCounter += 1;
  return `n${notificationCounter}`;
}

function fileNameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

/** Monta o documento completo de configurações a partir do estado atual e agenda a gravação (debounced — evita martelar disco a cada tick de um slider). */
function schedulePersist(get: () => AppState) {
  if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
  persistDebounceTimer = setTimeout(() => persistNow(get), 400);
}

function persistNow(get: () => AppState) {
  const s = get();
  const snapshot: AppSettings = {
    lastWorkspacePath: s.lastWorkspacePath,
    theme: s.themePreference,
    isPreviewCollapsed: s.isPreviewCollapsed,
    lastOpenTabPaths: s.settings.files.restoreLastSession ? s.tabs.map((t) => t.filePath) : [],
    lastActiveTabPath: s.settings.files.restoreLastSession ? s.activeTabId : null,
    editor: s.settings.editor,
    preview: s.settings.preview,
    files: s.settings.files,
    markup: s.settings.markup,
  };
  void saveSettings(snapshot);
}

export const useAppStore = create<AppState>((set, get) => {
  function pushNotification(severity: NotificationSeverity, message: string, autoDismiss = false) {
    const id = newNotificationId();
    set((s) => ({ notifications: [...s.notifications, { id, severity, message }] }));
    if (autoDismiss || severity === 'info' || severity === 'success') {
      setTimeout(() => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })), 4000);
    }
  }

  async function applyWorkspaceChanges(changes: WorkspaceChange[]) {
    const state = get().workspace;
    if (!state) return;
    const { state: next, external } = applyBatch(state, changes, selfWrites);
    set({ workspace: next });

    for (const path of external.changed) {
      const tab = get().tabs.find((t) => t.filePath === path);
      if (!tab) continue;
      if (!tab.isDirty) {
        try {
          const newText = await readDocument(path);
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tab.id ? { ...t, text: newText, savedText: newText, isDirty: false, isExternallyDeleted: false } : t,
            ),
          }));
          pushNotification('info', `Recarregado: ${fileNameOf(path)}`, true);
        } catch {
          // Arquivo sumiu entre o evento e a leitura — o próximo evento de remoção cobre isso.
        }
      } else {
        try {
          const externalText = await readDocument(path);
          set({ pendingConflict: { tabId: tab.id, externalText } });
        } catch {
          // idem
        }
      }
    }

    for (const path of external.removed) {
      const tab = get().tabs.find((t) => t.filePath === path);
      if (tab) {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, isExternallyDeleted: true } : t)) }));
        pushNotification('warning', `Arquivo removido externamente: ${fileNameOf(path)} — seu conteúdo continua aberto nesta aba.`);
      }
    }
  }

  function clearAutoSaveTimer(tabId: string) {
    const timer = autoSaveTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      autoSaveTimers.delete(tabId);
    }
  }

  function persistSessionTabs() {
    if (!get().settings.files.restoreLastSession) return;
    schedulePersist(get);
  }

  return {
    workspace: null,
    lastWorkspacePath: null,
    tabs: [],
    activeTabId: null,
    notifications: [],
    themePreference: DEFAULT_SETTINGS.theme,
    resolvedTheme: resolveTheme(DEFAULT_SETTINGS.theme),
    settings: {
      editor: { ...DEFAULT_SETTINGS.editor },
      preview: { ...DEFAULT_SETTINGS.preview },
      files: { ...DEFAULT_SETTINGS.files },
      markup: { ...DEFAULT_SETTINGS.markup },
    },
    searchQuery: '',
    isSidebarCollapsed: false,
    isPreviewCollapsed: false,
    isSettingsOpen: false,
    pendingCloseTabId: null,
    pendingConflict: null,
    pendingDeletePath: null,
    pendingRenamePath: null,
    isCommandPaletteOpen: false,
    isSearchOpen: false,
    isNewDocumentDialogOpen: false,

    async openWorkspace(path) {
      await stopWatching().catch(() => {});
      unlistenWorkspaceChanged?.();

      const workspace = await scanWorkspace(path);
      set({ workspace, tabs: [], activeTabId: null, lastWorkspacePath: path });

      await startWatching(path);
      unlistenWorkspaceChanged = await onWorkspaceChanged((changes) => {
        coalescer.flush(); // limpa resíduo de um lote anterior não drenado
        for (const change of changes) coalescer.enqueue(change.path, change.kind);
        void applyWorkspaceChanges(coalescer.flush());
      });

      persistNow(get);
    },

    async openFolderPicker() {
      const selected = await openFolderDialog({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        await get().openWorkspace(selected);
      }
    },

    async restoreLastWorkspace() {
      const settings = await loadSettings();
      const resolved = resolveTheme(settings.theme);
      set({
        themePreference: settings.theme,
        resolvedTheme: resolved,
        isPreviewCollapsed: settings.preview.openBehavior === 'remember' ? settings.isPreviewCollapsed : settings.preview.openBehavior === 'closed',
        settings: {
          editor: settings.editor,
          preview: settings.preview,
          files: settings.files,
          markup: settings.markup,
        },
      });

      if (!themeWatcherRegistered) {
        themeWatcherRegistered = true;
        window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (get().themePreference !== 'system') return;
          set({ resolvedTheme: e.matches ? 'dark' : 'light' });
        });
      }

      if (!settings.lastWorkspacePath) return;
      try {
        await get().openWorkspace(settings.lastWorkspacePath);
      } catch {
        // Pasta não existe mais — restaura silenciosamente pro estado vazio (missão §83: só restaura quando seguro).
        return;
      }

      if (settings.files.restoreLastSession && settings.lastOpenTabPaths.length > 0) {
        const workspace = get().workspace;
        for (const path of settings.lastOpenTabPaths) {
          if (workspace && !workspace.nodes[path]) continue; // arquivo não existe mais — pula silenciosamente
          await get().openDocument(path);
        }
        if (settings.lastActiveTabPath && get().tabs.some((t) => t.id === settings.lastActiveTabPath)) {
          set({ activeTabId: settings.lastActiveTabPath });
        }
      }
    },

    async openDocument(path) {
      const existing = get().tabs.find((t) => t.filePath === path);
      if (existing) {
        set({ activeTabId: existing.id });
        return;
      }
      try {
        const text = await readDocument(path);
        const tab: DocumentTab = { id: path, filePath: path, text, savedText: text, isDirty: false, isExternallyDeleted: false };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
        persistSessionTabs();
      } catch (error) {
        pushNotification('error', `Não foi possível abrir '${fileNameOf(path)}': ${String(error)}`);
      }
    },

    async createNewDocument(fileName) {
      const workspace = get().workspace;
      if (!workspace) return;
      const defaultExt = get().settings.markup.defaultExtension;
      const name = /\.(markup|mkup)$/i.test(fileName) ? fileName : `${fileName}${defaultExt}`;
      const sep = workspace.rootPath.includes('\\') ? '\\' : '/';
      const path = `${workspace.rootPath.replace(/[\\/]+$/, '')}${sep}${name}`;

      try {
        await createDocument(path, '');
      } catch (error) {
        pushNotification('error', `Não foi possível criar '${name}': ${String(error)}`);
        return;
      }
      await get().openDocument(path);
    },

    setActiveTab(tabId) {
      set({ activeTabId: tabId });
      persistSessionTabs();
    },

    updateTabText(tabId, text) {
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, text, isDirty: true } : t)) }));

      const { autoSave, autoSaveIntervalSeconds } = get().settings.files;
      if (autoSave === 'off') return;
      clearAutoSaveTimer(tabId);
      const delayMs = autoSave === 'on' ? 1000 : autoSaveIntervalSeconds * 1000;
      const timer = setTimeout(() => {
        autoSaveTimers.delete(tabId);
        void get().saveTab(tabId);
      }, delayMs);
      autoSaveTimers.set(tabId, timer);
    },

    async saveTab(tabId) {
      clearAutoSaveTimer(tabId);
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab || (!tab.isDirty && !tab.isExternallyDeleted)) return;

      selfWrites.set(tab.filePath, Date.now());
      try {
        await writeDocumentAtomic(tab.filePath, tab.text);
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, savedText: t.text, isDirty: false, isExternallyDeleted: false } : t)),
        }));
        pushNotification('success', `Salvo: ${fileNameOf(tab.filePath)}`, true);
      } catch (error) {
        pushNotification('error', `Falha ao salvar '${fileNameOf(tab.filePath)}': ${String(error)}`);
      }
    },

    requestCloseTab(tabId) {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.isDirty && get().settings.files.confirmBeforeClosingDirty) {
        set({ pendingCloseTabId: tabId });
      } else {
        closeTabImmediately(set, get, tabId);
      }
    },

    async confirmCloseTab(choice) {
      const tabId = get().pendingCloseTabId;
      set({ pendingCloseTabId: null });
      if (!tabId || choice === 'cancel') return;
      if (choice === 'save') await get().saveTab(tabId);
      closeTabImmediately(set, get, tabId);
    },

    resolveConflictKeepExternal() {
      const pending = get().pendingConflict;
      if (!pending) return;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === pending.tabId
            ? { ...t, text: pending.externalText, savedText: pending.externalText, isDirty: false, isExternallyDeleted: false }
            : t,
        ),
        pendingConflict: null,
      }));
      pushNotification('info', 'Recarregado (versão externa).', true);
    },

    resolveConflictKeepMine() {
      set({ pendingConflict: null });
      pushNotification('warning', 'Mantendo sua versão — salve para sobrescrever a versão externa.');
    },

    requestDelete(path) {
      set({ pendingDeletePath: path });
    },

    async confirmDelete() {
      const path = get().pendingDeletePath;
      set({ pendingDeletePath: null });
      if (!path) return;

      const node = get().workspace?.nodes[path];
      try {
        await remove(path, { recursive: node?.isDirectory ?? false });
        // O watcher pega a remoção e atualiza o índice sozinho (mesmo
        // caminho que uma exclusão feita fora do app tomaria) — evita
        // duplicar a lógica de mutação do índice aqui.
        pushNotification('success', `Excluído: ${fileNameOf(path)}`, true);
      } catch (error) {
        pushNotification('error', `Falha ao excluir '${fileNameOf(path)}': ${String(error)}`);
      }
    },

    cancelDelete() {
      set({ pendingDeletePath: null });
    },

    requestRename(path) {
      set({ pendingRenamePath: path });
    },

    async confirmRename(newName) {
      const path = get().pendingRenamePath;
      set({ pendingRenamePath: null });
      if (!path || !newName.trim()) return;

      const workspace = get().workspace;
      const node = workspace?.nodes[path];
      if (!workspace || !node) return;

      const sep = path.includes('\\') ? '\\' : '/';
      const dir = path.slice(0, path.length - node.name.length - 1);
      const defaultExt = get().settings.markup.defaultExtension;
      const finalName = node.isDirectory || /\.(markup|mkup)$/i.test(newName) ? newName : `${newName}${defaultExt}`;
      const newPath = `${dir}${sep}${finalName}`;

      if (await exists(newPath)) {
        pushNotification('error', `Já existe '${finalName}' nessa pasta.`);
        return;
      }

      try {
        await renamePath(path, newPath);
        const openTab = get().tabs.find((t) => t.filePath === path);
        if (openTab) {
          set((s) => ({ tabs: s.tabs.map((t) => (t.id === openTab.id ? { ...t, id: newPath, filePath: newPath } : t)) }));
          persistSessionTabs();
        }
      } catch (error) {
        pushNotification('error', `Falha ao renomear: ${String(error)}`);
      }
    },

    cancelRename() {
      set({ pendingRenamePath: null });
    },

    setCommandPaletteOpen(open) {
      set({ isCommandPaletteOpen: open });
    },

    setSearchOpen(open) {
      set({ isSearchOpen: open, searchQuery: '' });
    },

    setNewDocumentDialogOpen(open) {
      set({ isNewDocumentDialogOpen: open });
    },

    setSettingsOpen(open) {
      set({ isSettingsOpen: open });
    },

    setThemePreference(pref) {
      set({ themePreference: pref, resolvedTheme: resolveTheme(pref) });
      persistNow(get);
    },

    toggleSidebar() {
      set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed }));
    },

    togglePreview() {
      set((s) => ({ isPreviewCollapsed: !s.isPreviewCollapsed }));
      persistNow(get);
    },

    updateEditorSettings(patch) {
      set((s) => ({ settings: { ...s.settings, editor: { ...s.settings.editor, ...patch } } }));
      schedulePersist(get);
    },

    updatePreviewSettings(patch) {
      set((s) => ({ settings: { ...s.settings, preview: { ...s.settings.preview, ...patch } } }));
      schedulePersist(get);
    },

    updateFilesSettings(patch) {
      set((s) => ({ settings: { ...s.settings, files: { ...s.settings.files, ...patch } } }));
      schedulePersist(get);
    },

    updateMarkupSettings(patch) {
      set((s) => ({ settings: { ...s.settings, markup: { ...s.settings.markup, ...patch } } }));
      schedulePersist(get);
    },

    setSearchQuery(query) {
      set({ searchQuery: query });
    },

    notify(severity, message, autoDismiss) {
      pushNotification(severity, message, autoDismiss);
    },

    dismissNotification(id) {
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    },

    resolveWikiLink(target) {
      const workspace = get().workspace;
      if (!workspace) return { exists: false };
      const result = resolveWikiLinkInIndex(workspace, target);
      return result.exists ? { exists: true, href: result.path } : { exists: false };
    },

    fileList() {
      const workspace = get().workspace;
      return workspace ? getFileList(workspace) : [];
    },
  };
});

function closeTabImmediately(
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
  tabId: string,
) {
  const timer = autoSaveTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    autoSaveTimers.delete(tabId);
  }
  const tabs = get().tabs.filter((t) => t.id !== tabId);
  const wasActive = get().activeTabId === tabId;
  set({ tabs, activeTabId: wasActive ? (tabs.at(-1)?.id ?? null) : get().activeTabId });
  if (get().settings.files.restoreLastSession) schedulePersist(get);
}

/** Reconciliação periódica (30s) — segunda linha de defesa contra eventos perdidos (missão §34). Chamado pelo App na montagem. */
export function startPeriodicReconciliation(): () => void {
  const interval = setInterval(() => {
    const state = useAppStore.getState();
    if (!state.workspace) return;
    void scanWorkspace(state.workspace.rootPath).then((fresh) => {
      const current = useAppStore.getState().workspace;
      if (!current) return;
      const { state: next } = reconcileWithFreshScan(current, fresh);
      useAppStore.setState({ workspace: next });
    });
  }, 30_000);
  return () => clearInterval(interval);
}
