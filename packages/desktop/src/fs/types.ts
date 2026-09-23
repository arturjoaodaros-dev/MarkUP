export interface FileEntry {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  children?: FileEntry[];
}

/**
 * Everything the app needs from the platform. Paths use forward slashes.
 * Two implementations: Tauri (real files) and memory (browser, samples).
 */
export interface WorkspaceFs {
  readonly kind: 'tauri' | 'memory';
  /** Shows a folder picker; resolves to the chosen folder or null. */
  pickFolder(): Promise<string | null>;
  /** Makes `root` the workspace; returns its normalised path. */
  open(root: string): Promise<string>;
  listTree(): Promise<FileEntry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Moves to the trash where the platform has one. */
  remove(path: string): Promise<void>;
  watch(onChange: (paths: string[]) => void): Promise<() => void>;
  /** Save dialog for exports; resolves to the chosen path or null. */
  exportHtml(suggestedName: string, html: string): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  /** A URL the preview can load for a local file, or null when unsupported. */
  fileUrl(path: string): string | null;
  /** Files passed to the app at launch. */
  launchFiles(): Promise<string[]>;
  confirm(message: string, options?: { title?: string; okLabel?: string }): Promise<boolean>;
}

export const MARKUP_FILE = /\.(markup|mkup|md)$/i;

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? path.slice(0, Math.max(i, 0)) || '/' : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function join(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name.replace(/^\/+/, '')}`;
}

/** Resolves `.` and `..` segments. */
export function normalize(path: string): string {
  const parts: string[] = [];
  const absolute = path.startsWith('/');
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  const joined = parts.join('/');
  return absolute ? `/${joined}` : joined;
}

export function relative(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

export function flatten(entries: readonly FileEntry[]): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (list: readonly FileEntry[]) => {
    for (const entry of list) {
      out.push(entry);
      if (entry.children) walk(entry.children);
    }
  };
  walk(entries);
  return out;
}
