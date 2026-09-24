import { editor } from '../editor/controller.ts';
import type { Workbench } from './workbench.ts';

const DOCS_URL = 'https://markup.rweb.site/';

export interface Command {
  id: string;
  title: string;
  category: 'File' | 'View' | 'Go' | 'Edit' | 'Preferences' | 'Help' | 'Workspace';
  /** `mod+shift+p` style; the first one is shown in menus. */
  shortcuts?: string[];
  /** A shortcut handled elsewhere (e.g. by the editor), shown in menus but not bound globally. */
  hint?: string;
  run: () => void | Promise<void>;
  /** Hidden from the palette when false. */
  available?: () => boolean;
}

export function createCommands(wb: Workbench): Command[] {
  const hasDoc = () => wb.state.active !== null;
  const hasWorkspace = () => wb.state.workspace !== null;
  return [
    {
      id: 'palette.commands',
      title: 'Show All Commands',
      category: 'Go',
      shortcuts: ['mod+shift+p', 'f1'],
      run: () => wb.openPalette('commands'),
    },
    {
      id: 'palette.files',
      title: 'Go to File…',
      category: 'Go',
      shortcuts: ['mod+p'],
      run: () => wb.openPalette('files'),
      available: hasWorkspace,
    },
    {
      id: 'palette.symbols',
      title: 'Go to Heading or Component…',
      category: 'Go',
      shortcuts: ['mod+shift+o'],
      run: () => wb.openPalette('symbols'),
      available: hasDoc,
    },
    {
      id: 'palette.line',
      title: 'Go to Line…',
      category: 'Go',
      shortcuts: ['mod+g'],
      run: () => wb.openPalette('line'),
      available: hasDoc,
    },
    {
      id: 'edit.insertComponent',
      title: 'Insert Component…',
      category: 'Edit',
      shortcuts: ['mod+alt+i'],
      run: () => wb.openPalette('components'),
      available: hasDoc,
    },
    {
      id: 'edit.undo',
      title: 'Undo',
      category: 'Edit',
      hint: 'mod+z',
      run: () => editor.undo(),
      available: hasDoc,
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      category: 'Edit',
      hint: 'mod+shift+z',
      run: () => editor.redo(),
      available: hasDoc,
    },
    {
      id: 'edit.find',
      title: 'Find in File',
      category: 'Edit',
      shortcuts: ['mod+f'],
      run: () => editor.find(),
      available: hasDoc,
    },
    {
      id: 'edit.foldAll',
      title: 'Fold All',
      category: 'Edit',
      run: () => editor.foldAll(),
      available: hasDoc,
    },
    {
      id: 'edit.unfoldAll',
      title: 'Unfold All',
      category: 'Edit',
      run: () => editor.unfoldAll(),
      available: hasDoc,
    },

    {
      id: 'file.openFolder',
      title: 'Open Folder…',
      category: 'File',
      shortcuts: ['mod+o'],
      run: () => wb.pickAndOpenFolder(),
    },
    {
      id: 'file.new',
      title: 'New File',
      category: 'File',
      shortcuts: ['mod+n'],
      run: () => wb.startCreate('new-file'),
      available: hasWorkspace,
    },
    {
      id: 'file.newFolder',
      title: 'New Folder',
      category: 'File',
      run: () => wb.startCreate('new-folder'),
      available: hasWorkspace,
    },
    {
      id: 'file.save',
      title: 'Save',
      category: 'File',
      shortcuts: ['mod+s'],
      run: () => void wb.save(),
      available: hasDoc,
    },
    {
      id: 'file.saveAll',
      title: 'Save All',
      category: 'File',
      shortcuts: ['mod+alt+s'],
      run: () => wb.saveAll(),
      available: hasWorkspace,
    },
    {
      id: 'file.close',
      title: 'Close Tab',
      category: 'File',
      shortcuts: ['mod+w'],
      run: () => (wb.state.active ? wb.closeTab(wb.state.active) : undefined),
      available: hasDoc,
    },
    {
      id: 'file.closeOthers',
      title: 'Close Other Tabs',
      category: 'File',
      run: () => (wb.state.active ? wb.closeOthers(wb.state.active) : undefined),
      available: hasDoc,
    },
    {
      id: 'file.export',
      title: 'Export to HTML…',
      category: 'File',
      shortcuts: ['mod+shift+s'],
      run: () => wb.exportHtml(),
      available: hasDoc,
    },
    {
      id: 'file.refresh',
      title: 'Refresh Explorer',
      category: 'Workspace',
      run: () => wb.refreshTree(),
      available: hasWorkspace,
    },
    {
      id: 'workspace.samples',
      title: 'Open Sample Workspace',
      category: 'Workspace',
      run: () => wb.openSamples(),
      available: () => wb.fs.kind === 'memory',
    },
    {
      id: 'workspace.resetSamples',
      title: 'Reset Samples',
      category: 'Workspace',
      run: () => wb.resetSamples(),
      available: () => wb.fs.kind === 'memory',
    },

    {
      id: 'view.sidebar',
      title: 'Toggle Sidebar',
      category: 'View',
      shortcuts: ['mod+b'],
      run: () => wb.toggleSidebar(),
    },
    {
      id: 'view.explorer',
      title: 'Show Explorer',
      category: 'View',
      shortcuts: ['mod+shift+e'],
      run: () => wb.showSidebar('explorer'),
    },
    {
      id: 'view.search',
      title: 'Search in Files',
      category: 'View',
      shortcuts: ['mod+shift+f'],
      run: () => wb.store.set({ sidebar: 'search' }),
    },
    {
      id: 'view.outline',
      title: 'Show Outline',
      category: 'View',
      shortcuts: ['mod+shift+u'],
      run: () => wb.showSidebar('outline'),
    },
    {
      id: 'view.problems',
      title: 'Show Problems',
      category: 'View',
      shortcuts: ['mod+shift+m'],
      run: () => wb.showSidebar('problems'),
    },
    {
      id: 'view.cycle',
      title: 'Cycle Editor / Split / Preview',
      category: 'View',
      shortcuts: ['mod+\\'],
      run: () => wb.cycleView(),
    },
    {
      id: 'view.editor',
      title: 'Editor Only',
      category: 'View',
      shortcuts: ['mod+alt+1'],
      run: () => wb.setView('editor'),
    },
    {
      id: 'view.split',
      title: 'Editor and Preview',
      category: 'View',
      shortcuts: ['mod+alt+2'],
      run: () => wb.setView('split'),
    },
    {
      id: 'view.preview',
      title: 'Preview Only',
      category: 'View',
      shortcuts: ['mod+alt+3'],
      run: () => wb.setView('preview'),
    },
    {
      id: 'view.nextTab',
      title: 'Next Tab',
      category: 'View',
      shortcuts: ['ctrl+tab', 'mod+pagedown'],
      run: () => wb.cycleTab(1),
    },
    {
      id: 'view.previousTab',
      title: 'Previous Tab',
      category: 'View',
      shortcuts: ['ctrl+shift+tab', 'mod+pageup'],
      run: () => wb.cycleTab(-1),
    },
    {
      id: 'view.zoomIn',
      title: 'Increase Font Size',
      category: 'View',
      shortcuts: ['mod+='],
      run: () => wb.zoom(1),
    },
    {
      id: 'view.zoomOut',
      title: 'Decrease Font Size',
      category: 'View',
      shortcuts: ['mod+-'],
      run: () => wb.zoom(-1),
    },
    {
      id: 'view.zoomReset',
      title: 'Reset Font Size',
      category: 'View',
      shortcuts: ['mod+0'],
      run: () => wb.updateSettings({ fontSize: 14 }),
    },

    {
      id: 'settings.open',
      title: 'Open Settings',
      category: 'Preferences',
      shortcuts: ['mod+,'],
      run: () => wb.store.set({ settingsOpen: 'settings' }),
    },
    {
      id: 'settings.theme',
      title: 'Toggle Light / Dark Theme',
      category: 'Preferences',
      run: () =>
        wb.updateSettings({
          theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light',
        }),
    },
    {
      id: 'settings.wrap',
      title: 'Toggle Word Wrap',
      category: 'Preferences',
      shortcuts: ['alt+z'],
      run: () => wb.updateSettings({ wordWrap: !wb.state.settings.wordWrap }),
    },
    {
      id: 'settings.lineNumbers',
      title: 'Toggle Line Numbers',
      category: 'Preferences',
      run: () => wb.updateSettings({ lineNumbers: !wb.state.settings.lineNumbers }),
    },
    {
      id: 'settings.scrollSync',
      title: 'Toggle Scroll Sync',
      category: 'Preferences',
      run: () => wb.updateSettings({ scrollSync: !wb.state.settings.scrollSync }),
    },
    {
      id: 'help.shortcuts',
      title: 'Keyboard Shortcuts',
      category: 'Help',
      run: () => wb.store.set({ settingsOpen: 'shortcuts' }),
    },
    {
      id: 'help.docs',
      title: 'Documentation',
      category: 'Help',
      run: () => wb.fs.openExternal(DOCS_URL),
    },
    {
      id: 'help.syntax',
      title: 'Syntax Reference',
      category: 'Help',
      run: () => wb.fs.openExternal(`${DOCS_URL}syntax/directives.html`),
    },
    {
      id: 'help.issue',
      title: 'Report an Issue',
      category: 'Help',
      run: () => wb.fs.openExternal('https://github.com/arturjoaodaros-dev/MarkUP/issues'),
    },
  ];
}
