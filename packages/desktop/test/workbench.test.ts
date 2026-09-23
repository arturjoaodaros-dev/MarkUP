import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryFs, SAMPLE_ROOT } from '../src/fs/memory.ts';
import { dirname, join, normalize, relative, type WorkspaceFs } from '../src/fs/types.ts';
import { fuzzyFilter, fuzzyMatch } from '../src/lib/fuzzy.ts';
import { eventToShortcut, formatShortcut } from '../src/lib/keys.ts';
import { toCodeMirrorSnippet } from '../src/editor/snippets.ts';
import { DEFAULT_SETTINGS, loadSettings } from '../src/state/settings.ts';
import { initialState, isDirty, Store } from '../src/state/store.ts';
import { Workbench } from '../src/state/workbench.ts';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

let storage: MemoryStorage;
let fs: WorkspaceFs;
let wb: Workbench;
let answer = true;

beforeEach(async () => {
  storage = new MemoryStorage();
  fs = { ...createMemoryFs(storage), confirm: async () => answer };
  answer = true;
  wb = new Workbench(new Store(initialState()), fs, storage);
  await wb.openWorkspace(SAMPLE_ROOT);
});

describe('workspace', () => {
  it('lists the sample tree with folders first', () => {
    expect(wb.state.tree.map((e) => e.name)).toEqual([
      'drafts',
      'guides',
      'showcase.markup',
      'welcome.markup',
    ]);
    expect(wb.state.workspace?.name).toBe('samples');
  });

  it('scans every document for problems', async () => {
    await wb.scanProblems();
    expect(wb.state.problems[`${SAMPLE_ROOT}/drafts/broken.markup`]!.errors).toBeGreaterThan(0);
    expect(wb.state.problems[`${SAMPLE_ROOT}/showcase.markup`]).toEqual({ errors: 0, warnings: 0 });
    expect(wb.state.problems[`${SAMPLE_ROOT}/welcome.markup`]).toEqual({ errors: 0, warnings: 0 });
  });

  it('remembers open tabs per workspace', async () => {
    await wb.openFile(`${SAMPLE_ROOT}/welcome.markup`);
    const again = new Workbench(new Store(initialState()), fs, storage);
    await again.openWorkspace(SAMPLE_ROOT);
    expect(again.state.tabs).toEqual([`${SAMPLE_ROOT}/welcome.markup`]);
    expect(again.state.recent[0]).toBe(SAMPLE_ROOT);
  });
});

describe('documents', () => {
  const path = `${SAMPLE_ROOT}/welcome.markup`;

  it('opens, edits and saves', async () => {
    await wb.openFile(path);
    expect(wb.state.active).toBe(path);
    wb.setContent(path, '# Changed');
    expect(isDirty(wb.state.docs[path])).toBe(true);
    expect(await wb.save()).toBe(true);
    expect(isDirty(wb.state.docs[path])).toBe(false);
    expect(await fs.readText(path)).toBe('# Changed');
  });

  it('asks before closing a dirty tab and keeps it when declined', async () => {
    await wb.openFile(path);
    wb.setContent(path, 'unsaved');
    answer = false;
    await wb.closeTab(path);
    expect(wb.state.tabs).toEqual([path]);
    answer = true;
    await wb.closeTab(path);
    expect(wb.state.tabs).toEqual([]);
    expect(wb.state.active).toBeNull();
  });

  it('cycles tabs and activates the neighbour of a closed tab', async () => {
    const files = ['welcome.markup', 'showcase.markup', 'guides/getting-started.markup'].map(
      (f) => `${SAMPLE_ROOT}/${f}`,
    );
    for (const f of files) await wb.openFile(f);
    wb.cycleTab(1);
    expect(wb.state.active).toBe(files[0]);
    await wb.closeTab(files[0]!);
    expect(wb.state.active).toBe(files[1]);
  });

  it('reloads clean documents changed on disk and flags conflicts on dirty ones', async () => {
    await wb.openFile(path);
    await fs.writeText(path, 'external');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 20));
    expect(wb.state.docs[path]!.content).toBe('external');
    wb.setContent(path, 'mine');
    await fs.writeText(path, 'external 2');
    await new Promise((r) => setTimeout(r, 20));
    expect(wb.state.docs[path]!.content).toBe('mine');
    expect(wb.state.docs[path]!.conflict).toBe(true);
  });

  it('opens links relative to the document', async () => {
    await wb.openRelative(path, 'guides/getting-started.markup#components');
    expect(wb.state.active).toBe(`${SAMPLE_ROOT}/guides/getting-started.markup`);
    await wb.openRelative(`${SAMPLE_ROOT}/guides/getting-started.markup`, '../showcase.markup');
    expect(wb.state.active).toBe(`${SAMPLE_ROOT}/showcase.markup`);
  });
});

describe('explorer operations', () => {
  it('creates files with a starter heading and opens them', async () => {
    wb.startCreate('new-file', `${SAMPLE_ROOT}/guides`);
    await wb.commitEditing('release-notes');
    const created = `${SAMPLE_ROOT}/guides/release-notes.markup`;
    expect(wb.state.active).toBe(created);
    expect(await fs.readText(created)).toBe('# Release notes\n\n');
  });

  it('rejects invalid names and duplicates', async () => {
    wb.startCreate('new-file', SAMPLE_ROOT);
    await wb.commitEditing('a/b');
    expect(wb.state.toasts.at(-1)?.message).toMatch(/not a valid name/);
    wb.startCreate('new-file', SAMPLE_ROOT);
    await wb.commitEditing('welcome.markup');
    expect(wb.state.toasts.at(-1)?.message).toMatch(/already exists/);
  });

  it('renames folders and moves open tabs with them', async () => {
    const file = `${SAMPLE_ROOT}/guides/getting-started.markup`;
    await wb.openFile(file);
    wb.startRename(`${SAMPLE_ROOT}/guides`);
    await wb.commitEditing('docs');
    expect(wb.state.tabs).toEqual([`${SAMPLE_ROOT}/docs/getting-started.markup`]);
    expect(wb.state.tree.map((e) => e.name)).toContain('docs');
  });

  it('deletes after confirmation and closes affected tabs', async () => {
    const file = `${SAMPLE_ROOT}/drafts/broken.markup`;
    await wb.openFile(file);
    await wb.remove(`${SAMPLE_ROOT}/drafts`);
    expect(wb.state.tabs).toEqual([]);
    expect(wb.state.tree.map((e) => e.name)).not.toContain('drafts');
  });
});

describe('helpers', () => {
  it('handles paths', () => {
    expect(join('/a/b/', '/c')).toBe('/a/b/c');
    expect(dirname('/a/b/c.markup')).toBe('/a/b');
    expect(normalize('/a/b/../c/./d')).toBe('/a/c/d');
    expect(relative('/a', '/a/b/c')).toBe('b/c');
    expect(relative('C:/Users/me', 'C:/Users/me/doc.markup')).toBe('doc.markup');
  });

  it('ranks fuzzy matches sensibly', () => {
    expect(fuzzyMatch('xyz', 'showcase.markup')).toBeNull();
    const ranked = fuzzyFilter(
      'theme',
      ['Go: Go to Heading or Component', 'Preferences: Toggle Light / Dark Theme'],
      (s) => s,
    );
    expect(ranked[0]!.item).toMatch(/Theme/);
    expect(
      fuzzyFilter('gs', ['guides/getting-started.markup', 'showcase.markup'], (s) => s)[0]!.item,
    ).toBe('guides/getting-started.markup');
  });

  it('converts LSP snippets to CodeMirror snippets', () => {
    expect(toCodeMirrorSnippet(':::card[${1:Title}]\n$0\n:::')).toBe(
      ':::card[${1:Title}]\n${0}\n:::',
    );
    expect(toCodeMirrorSnippet(':badge[${1:Text}]{variant=${2|neutral,info|}}')).toBe(
      ':badge[${1:Text}]\\{variant=${2:neutral}\\}',
    );
    expect(toCodeMirrorSnippet('::toc{depth=${1:3}}')).toBe('::toc\\{depth=${1:3}\\}');
  });

  it('normalises keyboard shortcuts', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'P',
      code: 'KeyP',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(eventToShortcut(event)).toBe('mod+shift+p');
    expect(
      eventToShortcut(new KeyboardEvent('keydown', { key: '|', code: 'Backslash', ctrlKey: true })),
    ).toBe('mod+\\');
    expect(formatShortcut('mod+shift+p')).toBe('Ctrl+Shift+P');
  });

  it('loads settings defensively', () => {
    const s = new MemoryStorage();
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem(
      'markup.desktop.settings.v1',
      JSON.stringify({ fontSize: 99, tabSize: 3, theme: 'light', bogus: 1, wordWrap: 'yes' }),
    );
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, fontSize: 28, theme: 'light' });
    s.setItem('markup.desktop.settings.v1', '{broken');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});
