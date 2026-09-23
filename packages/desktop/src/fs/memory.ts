/**
 * An in-browser file system, persisted to localStorage. Used when the app runs
 * outside Tauri (development in a browser, demos, tests).
 */
import brokenSample from '../samples/broken.markup?raw';
import gettingStarted from '../samples/getting-started.markup?raw';
import welcome from '../samples/welcome.markup?raw';
import showcase from '../../../../examples/showcase.markup?raw';
import { basename, dirname, type FileEntry, type WorkspaceFs } from './types.ts';

const KEY = 'markup.memfs.v1';
export const SAMPLE_ROOT = '/samples';

export const SAMPLE_FILES: Record<string, string> = {
  [`${SAMPLE_ROOT}/welcome.markup`]: welcome,
  [`${SAMPLE_ROOT}/showcase.markup`]: showcase,
  [`${SAMPLE_ROOT}/guides/getting-started.markup`]: gettingStarted,
  [`${SAMPLE_ROOT}/drafts/broken.markup`]: brokenSample,
};

interface Store {
  files: Record<string, string>;
  dirs: string[];
}

function load(storage: Storage | null): Store {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && typeof parsed.files === 'object' && Array.isArray(parsed.dirs)) return parsed;
    }
  } catch {
    // Corrupt or unavailable storage: start from the samples.
  }
  return { files: { ...SAMPLE_FILES }, dirs: [] };
}

export function createMemoryFs(storage: Storage | null = safeStorage()): WorkspaceFs {
  const store = load(storage);
  const listeners = new Set<(paths: string[]) => void>();
  const persist = (changed: string[]) => {
    try {
      storage?.setItem(KEY, JSON.stringify(store));
    } catch {
      // Quota exceeded: keep working in memory.
    }
    for (const listener of listeners) listener(changed);
  };
  const exists = (path: string) => path in store.files || store.dirs.includes(path) || Object.keys(store.files).some((f) => f.startsWith(`${path}/`));
  const fail = (message: string): never => {
    throw new Error(message);
  };

  return {
    kind: 'memory',
    pickFolder: async () => SAMPLE_ROOT,
    open: async (root) => root,
    async listTree() {
      const root: FileEntry = { path: '', name: '', kind: 'directory', children: [] };
      const dirNode = (path: string): FileEntry => {
        if (path === SAMPLE_ROOT || path === '/' || path === '') return root;
        const parent = dirNode(dirname(path));
        let node = parent.children!.find((c) => c.path === path);
        if (!node) {
          node = { path, name: basename(path), kind: 'directory', children: [] };
          parent.children!.push(node);
        }
        return node;
      };
      for (const dir of store.dirs) dirNode(dir);
      for (const path of Object.keys(store.files)) dirNode(dirname(path)).children!.push({ path, name: basename(path), kind: 'file' });
      const sort = (entries: FileEntry[]) => {
        entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.kind === 'directory' ? -1 : 1));
        for (const e of entries) if (e.children) sort(e.children);
        return entries;
      };
      return sort(root.children!);
    },
    async readText(path) {
      return path in store.files ? store.files[path]! : fail(`${path} does not exist.`);
    },
    async writeText(path, content) {
      store.files[path] = content;
      persist([path]);
    },
    async createFile(path, content = '') {
      if (exists(path)) fail(`${basename(path)} already exists.`);
      store.files[path] = content;
      persist([path]);
    },
    async createDirectory(path) {
      if (exists(path)) fail(`${basename(path)} already exists.`);
      store.dirs.push(path);
      persist([path]);
    },
    async rename(from, to) {
      if (exists(to)) fail(`${basename(to)} already exists.`);
      const changed: string[] = [from, to];
      for (const path of Object.keys(store.files)) {
        if (path === from || path.startsWith(`${from}/`)) {
          const next = to + path.slice(from.length);
          store.files[next] = store.files[path]!;
          delete store.files[path];
          changed.push(path, next);
        }
      }
      store.dirs = store.dirs.map((d) => (d === from || d.startsWith(`${from}/`) ? to + d.slice(from.length) : d));
      persist(changed);
    },
    async remove(path) {
      for (const file of Object.keys(store.files)) if (file === path || file.startsWith(`${path}/`)) delete store.files[file];
      store.dirs = store.dirs.filter((d) => d !== path && !d.startsWith(`${path}/`));
      persist([path]);
    },
    async watch(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    async exportHtml(suggestedName, html) {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return suggestedName;
    },
    async openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },
    fileUrl: () => null,
    launchFiles: async () => [],
    confirm: async (message) => window.confirm(message),
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Restores the sample files (used by the “Reset samples” command). */
export function resetMemoryFs(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to reset.
  }
}
