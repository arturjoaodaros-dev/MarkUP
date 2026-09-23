import { useEffect, useMemo } from 'react';
import { ActivityBar } from './components/ActivityBar.tsx';
import { EditorArea } from './components/EditorArea.tsx';
import { Palette } from './components/Palette.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { Toasts } from './components/Toasts.tsx';
import { useAppState, WorkbenchContext } from './context.ts';
import { isTauri } from './fs/index.ts';
import { eventToShortcut } from './lib/keys.ts';
import { createCommands } from './state/commands.ts';
import { resolvedTheme } from './state/settings.ts';
import { isDirty } from './state/store.ts';
import type { Workbench } from './state/workbench.ts';

export function App({ wb }: { wb: Workbench }) {
  const commands = useMemo(() => createCommands(wb), [wb]);
  const context = useMemo(() => ({ wb, commands }), [wb, commands]);

  // Global keyboard shortcuts (capture phase, so they work inside the editor too).
  useEffect(() => {
    const table = new Map<string, () => void>();
    for (const command of commands)
      for (const shortcut of command.shortcuts ?? []) table.set(shortcut, () => void command.run());
    const onKey = (event: KeyboardEvent) => {
      const shortcut = eventToShortcut(event);
      // Let CodeMirror handle find when the editor has focus.
      if (shortcut === 'mod+f' && (event.target as HTMLElement | null)?.closest('.cm-editor'))
        return;
      const action = table.get(shortcut);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [commands]);

  // Start-up: files passed on the command line, else the last workspace, else samples (browser).
  useEffect(() => {
    void (async () => {
      const files = await wb.fs.launchFiles();
      if (files.length > 0) {
        const first = files[0]!;
        await wb.openWorkspace(first.slice(0, first.lastIndexOf('/')));
        for (const file of files) await wb.openFile(file);
        return;
      }
      const last = wb.state.recent[0];
      if (last) await wb.openWorkspace(last);
      else if (wb.fs.kind === 'memory') await wb.openSamples();
    })();
  }, [wb]);

  // Never lose unsaved work when the window closes.
  useEffect(() => {
    if (isTauri) {
      let unlisten: (() => void) | undefined;
      void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          const dirty = Object.values(wb.state.docs)
            .filter(isDirty)
            .map((d) => d.path);
          if (dirty.length && !(await wb.confirmDiscard(dirty))) event.preventDefault();
        });
      });
      return () => unlisten?.();
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.values(wb.state.docs).some(isDirty)) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [wb]);

  return (
    <WorkbenchContext.Provider value={context}>
      <Shell />
    </WorkbenchContext.Provider>
  );
}

function Shell() {
  const settings = useAppState((s) => s.settings);
  const sidebar = useAppState((s) => s.sidebar);
  const workspace = useAppState((s) => s.workspace);
  const active = useAppState((s) => s.active);
  const dirty = useAppState((s) => (s.active ? isDirty(s.docs[s.active]) : false));

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolvedTheme(settings);
    };
    apply();
    if (settings.theme !== 'system') return;
    const media = matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings]);

  useEffect(() => {
    const file = active ? active.slice(active.lastIndexOf('/') + 1) : null;
    const title = [file ? `${dirty ? '● ' : ''}${file}` : null, workspace?.name, 'MarkUP']
      .filter(Boolean)
      .join(' — ');
    document.title = title;
    if (isTauri)
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
        .catch(() => {});
  }, [active, dirty, workspace]);

  return (
    <div className="app" style={{ ['--editor-font-size' as string]: `${settings.fontSize}px` }}>
      <div className="app-main">
        <ActivityBar />
        {sidebar && workspace && <Sidebar view={sidebar} />}
        <EditorArea />
      </div>
      <StatusBar />
      <Palette />
      <SettingsDialog />
      <Toasts />
    </div>
  );
}
