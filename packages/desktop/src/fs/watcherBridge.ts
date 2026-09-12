// Ponte fina com o comando Rust de watcher (src-tauri/src/watcher.rs). Só
// invoca/escuta — nenhuma lógica de domínio aqui, isso fica em
// workspaceIndex.ts (puro, testável sem Tauri rodando).

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { WorkspaceChange } from '../state/workspaceTypes';

export async function startWatching(path: string): Promise<void> {
  await invoke('watch_workspace', { path });
}

export async function stopWatching(): Promise<void> {
  await invoke('unwatch_workspace');
}

export function onWorkspaceChanged(handler: (changes: WorkspaceChange[]) => void): Promise<UnlistenFn> {
  return listen<WorkspaceChange[]>('workspace:changed', (event) => handler(event.payload));
}
