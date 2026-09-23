import { createMemoryFs } from './memory.ts';
import { createTauriFs } from './tauri.ts';
import type { WorkspaceFs } from './types.ts';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const fs: WorkspaceFs = isTauri ? createTauriFs() : createMemoryFs();

export * from './types.ts';
