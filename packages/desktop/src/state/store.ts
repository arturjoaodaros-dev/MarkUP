import { useSyncExternalStore } from 'react';
import type { FileEntry } from '../fs/types.ts';
import { DEFAULT_SETTINGS, type Settings } from './settings.ts';

export type ViewMode = 'editor' | 'split' | 'preview';
export type SidebarView = 'explorer' | 'search' | 'outline' | 'problems';
export type PaletteMode = 'files' | 'commands' | 'symbols' | 'line' | 'components';

export interface Doc {
  path: string;
  content: string;
  /** Content as last loaded from or saved to disk. */
  saved: string;
  /** The file changed on disk while there were unsaved edits. */
  conflict: boolean;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
}

export interface State {
  workspace: { root: string; name: string } | null;
  tree: FileEntry[];
  expanded: Record<string, boolean>;
  tabs: string[];
  active: string | null;
  docs: Record<string, Doc>;
  view: ViewMode;
  sidebar: SidebarView | null;
  sidebarWidth: number;
  split: number;
  palette: { mode: PaletteMode; query: string } | null;
  /** The settings dialog and the tab it shows, or false when closed. */
  settingsOpen: false | 'settings' | 'shortcuts';
  settings: Settings;
  cursor: { line: number; column: number; selected: number };
  toasts: Toast[];
  /** Pending inline creation/rename in the explorer. */
  editing: { kind: 'new-file' | 'new-folder' | 'rename'; parent: string; path?: string } | null;
  /** Diagnostics counts for every markup file in the workspace. */
  problems: Record<string, { errors: number; warnings: number }>;
  searchQuery: string;
  recent: string[];
}

type Listener = () => void;

export class Store {
  private state: State;
  private readonly listeners = new Set<Listener>();

  constructor(initial: State) {
    this.state = initial;
  }

  get = (): State => this.state;

  set = (update: Partial<State> | ((state: State) => Partial<State>)): void => {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export function initialState(
  settings: Settings = DEFAULT_SETTINGS,
  persisted: Partial<State> = {},
): State {
  return {
    workspace: null,
    tree: [],
    expanded: {},
    tabs: [],
    active: null,
    docs: {},
    view: 'split',
    sidebar: 'explorer',
    sidebarWidth: 260,
    split: 0.5,
    palette: null,
    settingsOpen: false,
    settings,
    cursor: { line: 1, column: 1, selected: 0 },
    toasts: [],
    editing: null,
    problems: {},
    searchQuery: '',
    recent: [],
    ...persisted,
  };
}

export function useStore<T>(store: Store, selector: (state: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

export function isDirty(doc: Doc | undefined): boolean {
  return !!doc && doc.content !== doc.saved;
}
