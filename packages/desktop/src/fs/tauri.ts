import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask, open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { FileEntry, WorkspaceFs } from './types.ts';

export function createTauriFs(): WorkspaceFs {
  return {
    kind: 'tauri',
    async pickFolder() {
      const selected = await open({ directory: true, multiple: false, title: 'Open folder' });
      return typeof selected === 'string' ? selected.replace(/\\/g, '/') : null;
    },
    open: (root) => invoke<string>('open_workspace', { path: root }),
    listTree: () => invoke<FileEntry[]>('list_tree'),
    readText: (path) => invoke<string>('read_text', { path }),
    writeText: (path, contents) => invoke('write_text', { path, contents }),
    createFile: (path, contents) => invoke('create_file', { path, contents: contents ?? '' }),
    createDirectory: (path) => invoke('create_dir', { path }),
    rename: (from, to) => invoke('rename_path', { from, to }),
    remove: (path) => invoke('delete_path', { path }),
    async watch(onChange) {
      await invoke('watch_workspace');
      return listen<string[]>('fs-change', (event) => onChange(event.payload));
    },
    async exportHtml(suggestedName, html) {
      const path = await save({
        defaultPath: suggestedName,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (!path) return null;
      await invoke('save_export', { path, contents: html });
      return path.replace(/\\/g, '/');
    },
    openExternal: (url) => openUrl(url),
    fileUrl: (path) => convertFileSrc(path),
    launchFiles: () => invoke<string[]>('launch_files'),
    confirm: (message, options) =>
      ask(message, {
        title: options?.title ?? 'MarkUP',
        kind: 'warning',
        okLabel: options?.okLabel,
      }),
  };
}
