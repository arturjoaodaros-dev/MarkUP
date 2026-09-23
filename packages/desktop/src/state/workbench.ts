/**
 * The workbench: every user-facing action (files, tabs, saving, exporting…)
 * lives here, operating on the store, the file system and the language service.
 * UI components only read state and call these methods.
 */
import { renderDocument } from '@markup-lang/html';
import { LanguageService } from '@markup-lang/language-service';
import { basename, dirname, flatten, join, MARKUP_FILE, normalize, type WorkspaceFs } from '../fs/types.ts';
import { resetMemoryFs, SAMPLE_ROOT } from '../fs/memory.ts';
import { saveSettings, type Settings } from './settings.ts';
import { isDirty, type Store, type PaletteMode, type SidebarView, type State, type Toast, type ViewMode } from './store.ts';

const SESSION_KEY = 'markup.desktop.session.v1';

interface Session {
  recent: string[];
  byRoot: Record<string, { tabs: string[]; active: string | null; expanded: Record<string, boolean> }>;
  view?: ViewMode;
  sidebar?: SidebarView | null;
  sidebarWidth?: number;
  split?: number;
}

export class Workbench {
  readonly store: Store;
  readonly fs: WorkspaceFs;
  readonly service = new LanguageService();
  private readonly storage: Storage | null;
  private unwatch: (() => void) | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private toastId = 0;
  /** Paths we just wrote, so our own saves are not reported as external changes. */
  private readonly ownWrites = new Map<string, number>();

  constructor(store: Store, fs: WorkspaceFs, storage: Storage | null) {
    this.store = store;
    this.fs = fs;
    this.storage = storage;
    const session = this.session();
    store.set({
      recent: session.recent,
      view: session.view ?? store.get().view,
      sidebar: session.sidebar === undefined ? store.get().sidebar : session.sidebar,
      sidebarWidth: session.sidebarWidth ?? store.get().sidebarWidth,
      split: session.split ?? store.get().split,
    });
  }

  get state(): State {
    return this.store.get();
  }

  // -------------------------------------------------------------------------
  // Workspace

  async pickAndOpenFolder(): Promise<void> {
    const root = await this.fs.pickFolder();
    if (root) await this.openWorkspace(root);
  }

  async openWorkspace(path: string): Promise<void> {
    if (!(await this.confirmDiscard(Object.values(this.state.docs).filter(isDirty).map((d) => d.path)))) return;
    try {
      const root = await this.fs.open(path);
      this.unwatch?.();
      const saved = this.session().byRoot[root];
      this.store.set({
        workspace: { root, name: basename(root) || root },
        tabs: [],
        active: null,
        docs: {},
        expanded: saved?.expanded ?? {},
        problems: {},
        recent: [root, ...this.state.recent.filter((r) => r !== root)].slice(0, 8),
      });
      await this.refreshTree();
      for (const tab of saved?.tabs ?? []) await this.openFile(tab, { quiet: true });
      if (saved?.active && this.state.tabs.includes(saved.active)) this.store.set({ active: saved.active });
      this.unwatch = await this.fs.watch((paths) => void this.onExternalChange(paths));
      this.persist();
      void this.scanProblems();
    } catch (error) {
      this.toast('error', `Could not open ${path}: ${message(error)}`);
    }
  }

  async openSamples(): Promise<void> {
    await this.openWorkspace(SAMPLE_ROOT);
    if (this.state.tabs.length === 0) await this.openFile(`${SAMPLE_ROOT}/welcome.markup`);
  }

  async resetSamples(): Promise<void> {
    if (this.fs.kind !== 'memory') return;
    if (!(await this.fs.confirm('Restore the sample files? Your changes to them will be lost.'))) return;
    resetMemoryFs();
    location.reload();
  }

  async refreshTree(): Promise<void> {
    if (!this.state.workspace) return;
    try {
      this.store.set({ tree: await this.fs.listTree() });
    } catch (error) {
      this.toast('error', `Could not read the folder: ${message(error)}`);
    }
  }

  /** Parses every MarkUP file once to fill the Problems view. */
  async scanProblems(): Promise<void> {
    const files = flatten(this.state.tree).filter((e) => e.kind === 'file' && MARKUP_FILE.test(e.path));
    const problems: State['problems'] = {};
    for (const file of files.slice(0, 2000)) {
      try {
        const content = this.state.docs[file.path]?.content ?? (await this.fs.readText(file.path));
        problems[file.path] = count(this.service.analyze(content, `scan:${file.path}`).diagnostics);
        this.service.forget(`scan:${file.path}`);
      } catch {
        // Unreadable files simply have no problems listed.
      }
    }
    this.store.set({ problems });
  }

  private updateProblems(path: string): void {
    const doc = this.state.docs[path];
    if (!doc || !MARKUP_FILE.test(path)) return;
    const counts = count(this.service.analyze(doc.content, path).diagnostics);
    const previous = this.state.problems[path];
    if (previous?.errors !== counts.errors || previous?.warnings !== counts.warnings) {
      this.store.set({ problems: { ...this.state.problems, [path]: counts } });
    }
  }

  // -------------------------------------------------------------------------
  // Tabs and documents

  async openFile(path: string, options: { quiet?: boolean } = {}): Promise<void> {
    if (!this.state.docs[path]) {
      try {
        const content = await this.fs.readText(path);
        this.store.set((s) => ({ docs: { ...s.docs, [path]: { path, content, saved: content, conflict: false } } }));
      } catch (error) {
        if (!options.quiet) this.toast('error', `Could not open ${basename(path)}: ${message(error)}`);
        return;
      }
    }
    this.store.set((s) => ({ tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path], active: path }));
    this.revealInTree(path);
    this.persist();
  }

  /** Opens a link target relative to a document. */
  async openRelative(from: string, href: string): Promise<void> {
    const [pathPart] = href.split('#');
    if (!pathPart) return;
    const target = normalize(join(dirname(from), decodeURIComponent(pathPart)));
    const exists = flatten(this.state.tree).some((e) => e.path === target);
    if (!exists) {
      this.toast('error', `No file at ${target}`);
      return;
    }
    await this.openFile(target);
  }

  activate(path: string): void {
    this.store.set({ active: path });
    this.persist();
  }

  cycleTab(delta: number): void {
    const { tabs, active } = this.state;
    if (tabs.length < 2 || !active) return;
    const next = tabs[(tabs.indexOf(active) + delta + tabs.length) % tabs.length]!;
    this.activate(next);
  }

  async closeTab(path: string): Promise<void> {
    if (!(await this.confirmDiscard(isDirty(this.state.docs[path]) ? [path] : []))) return;
    this.store.set((s) => {
      const index = s.tabs.indexOf(path);
      const tabs = s.tabs.filter((t) => t !== path);
      const docs = { ...s.docs };
      delete docs[path];
      const active = s.active === path ? (tabs[Math.min(index, tabs.length - 1)] ?? null) : s.active;
      return { tabs, docs, active };
    });
    this.service.forget(path);
    this.persist();
  }

  async closeOthers(path: string): Promise<void> {
    for (const tab of this.state.tabs.filter((t) => t !== path)) await this.closeTab(tab);
  }

  setContent(path: string, content: string): void {
    const doc = this.state.docs[path];
    if (!doc || doc.content === content) return;
    this.store.set((s) => ({ docs: { ...s.docs, [path]: { ...doc, content } } }));
    this.updateProblems(path);
    if (this.state.settings.autosave === 'afterDelay') {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => void this.saveAll(), 1000);
    }
  }

  async save(path = this.state.active): Promise<boolean> {
    if (!path) return false;
    const doc = this.state.docs[path];
    if (!doc) return false;
    try {
      this.ownWrites.set(path, Date.now());
      await this.fs.writeText(path, doc.content);
      this.store.set((s) => ({ docs: { ...s.docs, [path]: { ...s.docs[path]!, saved: doc.content, conflict: false } } }));
      return true;
    } catch (error) {
      this.toast('error', `Could not save ${basename(path)}: ${message(error)}`);
      return false;
    }
  }

  async saveAll(): Promise<void> {
    for (const doc of Object.values(this.state.docs)) if (isDirty(doc)) await this.save(doc.path);
  }

  /** Asks before throwing away unsaved changes. */
  async confirmDiscard(paths: string[]): Promise<boolean> {
    if (paths.length === 0) return true;
    const names = paths.map((p) => basename(p)).join(', ');
    return this.fs.confirm(`${names} ${paths.length === 1 ? 'has' : 'have'} unsaved changes. Discard them?`, { okLabel: 'Discard' });
  }

  private async onExternalChange(paths: string[]): Promise<void> {
    const now = Date.now();
    const relevant = paths.filter((p) => now - (this.ownWrites.get(p) ?? 0) > 1500);
    if (relevant.length === 0) return;
    await this.refreshTree();
    for (const path of relevant) {
      const doc = this.state.docs[path];
      if (!doc) continue;
      let content: string;
      try {
        content = await this.fs.readText(path);
      } catch {
        continue; // Deleted: keep the open buffer so nothing is lost.
      }
      if (content === doc.saved) continue;
      if (isDirty(doc)) {
        this.store.set((s) => ({ docs: { ...s.docs, [path]: { ...doc, conflict: true } } }));
        this.toast('info', `${basename(path)} changed on disk. Saving will overwrite it.`);
      } else {
        this.store.set((s) => ({ docs: { ...s.docs, [path]: { ...doc, content, saved: content } } }));
      }
    }
    void this.scanProblems();
  }

  // -------------------------------------------------------------------------
  // Explorer operations

  startCreate(kind: 'new-file' | 'new-folder', parent = this.defaultParent()): void {
    if (!parent) return;
    this.store.set((s) => ({ editing: { kind, parent }, expanded: { ...s.expanded, [parent]: true }, sidebar: 'explorer' }));
  }

  startRename(path: string): void {
    this.store.set({ editing: { kind: 'rename', parent: dirname(path), path } });
  }

  cancelEditing(): void {
    this.store.set({ editing: null });
  }

  async commitEditing(name: string): Promise<void> {
    const editing = this.state.editing;
    this.store.set({ editing: null });
    const trimmed = name.trim();
    if (!editing || !trimmed) return;
    if (/[\\/:*?"<>|]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
      this.toast('error', `“${trimmed}” is not a valid name.`);
      return;
    }
    try {
      if (editing.kind === 'rename' && editing.path) {
        const target = join(editing.parent, trimmed);
        if (target === editing.path) return;
        await this.fs.rename(editing.path, target);
        this.renameOpenDocs(editing.path, target);
      } else if (editing.kind === 'new-folder') {
        await this.fs.createDirectory(join(editing.parent, trimmed));
      } else {
        const file = join(editing.parent, /\.[^.]+$/.test(trimmed) ? trimmed : `${trimmed}.markup`);
        const title = basename(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        await this.fs.createFile(file, `# ${title[0]?.toUpperCase() ?? ''}${title.slice(1)}\n\n`);
        await this.refreshTree();
        await this.openFile(file);
      }
      await this.refreshTree();
    } catch (error) {
      this.toast('error', message(error));
    }
  }

  private renameOpenDocs(from: string, to: string): void {
    this.store.set((s) => {
      const move = (p: string) => (p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
      const docs: State['docs'] = {};
      for (const [path, doc] of Object.entries(s.docs)) docs[move(path)] = { ...doc, path: move(path) };
      return { docs, tabs: s.tabs.map(move), active: s.active ? move(s.active) : null };
    });
    this.persist();
  }

  async remove(path: string): Promise<void> {
    const trash = this.fs.kind === 'tauri' ? ' It will be moved to the trash.' : '';
    if (!(await this.fs.confirm(`Delete ${basename(path)}?${trash}`, { okLabel: 'Delete' }))) return;
    try {
      await this.fs.remove(path);
      for (const tab of this.state.tabs.filter((t) => t === path || t.startsWith(`${path}/`))) {
        this.store.set((s) => ({ docs: { ...s.docs, [tab]: { ...s.docs[tab]!, saved: s.docs[tab]!.content } } }));
        await this.closeTab(tab);
      }
      await this.refreshTree();
      void this.scanProblems();
    } catch (error) {
      this.toast('error', `Could not delete ${basename(path)}: ${message(error)}`);
    }
  }

  toggleFolder(path: string): void {
    this.store.set((s) => ({ expanded: { ...s.expanded, [path]: !s.expanded[path] } }));
    this.persist();
  }

  collapseAll(): void {
    this.store.set({ expanded: {} });
    this.persist();
  }

  private revealInTree(path: string): void {
    const root = this.state.workspace?.root;
    if (!root) return;
    const expanded = { ...this.state.expanded };
    for (let dir = dirname(path); dir.length > root.length; dir = dirname(dir)) expanded[dir] = true;
    this.store.set({ expanded });
  }

  private defaultParent(): string | null {
    const active = this.state.active;
    return active ? dirname(active) : (this.state.workspace?.root ?? null);
  }

  // -------------------------------------------------------------------------
  // Export, UI and settings

  async exportHtml(): Promise<void> {
    const path = this.state.active;
    const doc = path ? this.state.docs[path] : undefined;
    if (!path || !doc) return;
    const analysis = this.service.analyze(doc.content, path);
    const html = renderDocument(analysis.document, {
      theme: this.state.settings.theme === 'light' ? 'light' : this.state.settings.theme === 'dark' ? 'dark' : 'auto',
      rewriteUrl: (url) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : url.replace(/\.(?:markup|mkup|md)(?=[?#]|$)/i, '.html')),
    });
    try {
      const target = await this.fs.exportHtml(basename(path).replace(MARKUP_FILE, '') + '.html', html);
      if (target) this.toast('success', `Exported ${basename(target)}`);
    } catch (error) {
      this.toast('error', `Export failed: ${message(error)}`);
    }
  }

  setView(view: ViewMode): void {
    this.store.set({ view });
    this.persist();
  }

  cycleView(): void {
    const order: ViewMode[] = ['editor', 'split', 'preview'];
    this.setView(order[(order.indexOf(this.state.view) + 1) % order.length]!);
  }

  showSidebar(view: SidebarView): void {
    this.store.set((s) => ({ sidebar: s.sidebar === view ? null : view }));
    this.persist();
  }

  toggleSidebar(): void {
    this.store.set((s) => ({ sidebar: s.sidebar ? null : 'explorer' }));
    this.persist();
  }

  setSidebarWidth(width: number): void {
    this.store.set({ sidebarWidth: Math.round(Math.min(560, Math.max(180, width))) });
  }

  setSplit(ratio: number): void {
    this.store.set({ split: Math.min(0.8, Math.max(0.2, ratio)) });
  }

  openPalette(mode: PaletteMode, query = ''): void {
    this.store.set({ palette: { mode, query } });
  }

  closePalette(): void {
    this.store.set({ palette: null });
  }

  updateSettings(patch: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...patch };
    this.store.set({ settings });
    saveSettings(this.storage, settings);
  }

  zoom(delta: number): void {
    this.updateSettings({ fontSize: Math.min(28, Math.max(10, this.state.settings.fontSize + delta)) });
  }

  toast(kind: Toast['kind'], text: string): void {
    const id = ++this.toastId;
    this.store.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message: text }] }));
    setTimeout(() => this.dismissToast(id), kind === 'error' ? 7000 : 3500);
  }

  dismissToast(id: number): void {
    this.store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }

  // -------------------------------------------------------------------------
  // Session persistence

  private session(): Session {
    try {
      const raw = this.storage?.getItem(SESSION_KEY);
      if (raw) return { recent: [], byRoot: {}, ...(JSON.parse(raw) as Partial<Session>) };
    } catch {
      // Ignore a corrupt session.
    }
    return { recent: [], byRoot: {} };
  }

  persist(): void {
    const s = this.state;
    const session = this.session();
    if (s.workspace) session.byRoot[s.workspace.root] = { tabs: s.tabs, active: s.active, expanded: s.expanded };
    session.recent = s.recent;
    session.view = s.view;
    session.sidebar = s.sidebar;
    session.sidebarWidth = s.sidebarWidth;
    session.split = s.split;
    try {
      this.storage?.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Session is a convenience only.
    }
  }
}

function count(diagnostics: readonly { severity: string }[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') errors++;
    else if (d.severity === 'warning') warnings++;
  }
  return { errors, warnings };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
