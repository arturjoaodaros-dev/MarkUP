import { Code, Columns2, Download, Eye, X } from 'lucide-react';
import { useRef } from 'react';
import { useAppState, useWorkbench } from '../context.ts';
import { basename } from '../fs/types.ts';
import { formatShortcut } from '../lib/keys.ts';
import { isDirty, type ViewMode } from '../state/store.ts';
import { EditorPane } from './EditorPane.tsx';
import { FileIcon, IconButton } from './Explorer.tsx';
import { PreviewPane } from './PreviewPane.tsx';
import { Splitter } from './Splitter.tsx';
import { Welcome } from './Welcome.tsx';

const VIEWS: { mode: ViewMode; label: string; icon: typeof Code; shortcut: string }[] = [
  { mode: 'editor', label: 'Editor only', icon: Code, shortcut: 'mod+alt+1' },
  { mode: 'split', label: 'Editor and preview', icon: Columns2, shortcut: 'mod+alt+2' },
  { mode: 'preview', label: 'Preview only', icon: Eye, shortcut: 'mod+alt+3' },
];

export function EditorArea() {
  const { wb } = useWorkbench();
  const tabs = useAppState((s) => s.tabs);
  const active = useAppState((s) => s.active);
  const view = useAppState((s) => s.view);
  const split = useAppState((s) => s.split);
  const body = useRef<HTMLDivElement>(null);

  if (!active) {
    return (
      <main className="editor-area">
        <Welcome />
      </main>
    );
  }

  return (
    <main className="editor-area">
      <div className="editor-toolbar">
        <div className="tabs" role="tablist" onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}>
          {tabs.map((path) => (
            <Tab key={path} path={path} active={path === active} />
          ))}
        </div>
        <div className="toolbar-actions">
          <div className="segmented" role="group" aria-label="Layout">
            {VIEWS.map(({ mode, label, icon: Icon, shortcut }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                title={`${label} (${formatShortcut(shortcut)})`}
                aria-label={label}
                onClick={() => wb.setView(mode)}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          <IconButton label={`Export to HTML (${formatShortcut('mod+shift+s')})`} onClick={() => void wb.exportHtml()}>
            <Download size={15} />
          </IconButton>
        </div>
      </div>
      <div ref={body} className={`editor-body is-${view}`}>
        <div className="pane pane-editor" style={view === 'split' ? { flexBasis: `${split * 100}%` } : undefined} hidden={view === 'preview'}>
          <EditorPane />
        </div>
        {view === 'split' && (
          <Splitter
            orientation="vertical"
            className="editor-splitter"
            onDrag={(x) => {
              const rect = body.current?.getBoundingClientRect();
              if (rect) wb.setSplit((x - rect.left) / rect.width);
            }}
            onEnd={() => wb.persist()}
          />
        )}
        {view !== 'editor' && (
          <div className="pane pane-preview">
            <PreviewPane />
          </div>
        )}
      </div>
    </main>
  );
}

function Tab({ path, active }: { path: string; active: boolean }) {
  const { wb } = useWorkbench();
  const dirty = useAppState((s) => isDirty(s.docs[path]));
  const conflict = useAppState((s) => s.docs[path]?.conflict ?? false);
  const problems = useAppState((s) => s.problems[path]);
  // Same file name in two folders: show the folder too.
  const duplicate = useAppState((s) => s.tabs.filter((t) => basename(t) === basename(path)).length > 1);
  const name = basename(path);
  const folder = path.slice(0, path.lastIndexOf('/'));
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={`tab${active ? ' is-active' : ''}${dirty ? ' is-dirty' : ''}${problems?.errors ? ' has-error' : ''}`}
      title={`${path}${conflict ? ' — changed on disk' : ''}`}
      onMouseDown={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          void wb.closeTab(path);
        }
      }}
      onClick={() => wb.activate(path)}
    >
      <FileIcon name={name} />
      <span className="tab-label">{name}</span>
      {duplicate && <span className="tab-folder">{basename(folder)}</span>}
      <button
        type="button"
        className="tab-close"
        aria-label={`Close ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          void wb.closeTab(path);
        }}
      >
        {dirty ? <span className="dirty-dot" /> : <X size={13} />}
      </button>
    </div>
  );
}
