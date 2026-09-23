import {
  ChevronRight,
  ChevronsDownUp,
  FilePlus,
  FileText,
  FolderPlus,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppState, useWorkbench } from '../context.ts';
import { MARKUP_FILE, type FileEntry } from '../fs/types.ts';
import { isDirty } from '../state/store.ts';
import { ContextMenu, type MenuItem } from './ContextMenu.tsx';
import { PanelHeader } from './Sidebar.tsx';

export function Explorer() {
  const { wb } = useWorkbench();
  const workspace = useAppState((s) => s.workspace);
  const tree = useAppState((s) => s.tree);
  const editing = useAppState((s) => s.editing);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null);

  if (!workspace) return null;
  const rootEditing = editing && editing.kind !== 'rename' && editing.parent === workspace.root;

  const openMenu = (event: React.MouseEvent, entry: FileEntry | null) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, entry });
  };

  const menuItems = (entry: FileEntry | null): MenuItem[] => {
    const folder = entry
      ? entry.kind === 'directory'
        ? entry.path
        : entry.path.slice(0, entry.path.lastIndexOf('/'))
      : workspace.root;
    const items: MenuItem[] = [
      { label: 'New File', action: () => wb.startCreate('new-file', folder) },
      { label: 'New Folder', action: () => wb.startCreate('new-folder', folder) },
    ];
    if (entry) {
      items.push(
        { separator: true },
        { label: 'Rename…', shortcut: 'F2', action: () => wb.startRename(entry.path) },
        { label: 'Delete', danger: true, action: () => void wb.remove(entry.path) },
        { separator: true },
        { label: 'Copy Path', action: () => void navigator.clipboard?.writeText(entry.path) },
      );
    }
    return items;
  };

  return (
    <section className="panel" aria-label="Explorer">
      <PanelHeader title={workspace.name}>
        <IconButton label="New File" onClick={() => wb.startCreate('new-file', workspace.root)}>
          <FilePlus size={15} />
        </IconButton>
        <IconButton label="New Folder" onClick={() => wb.startCreate('new-folder', workspace.root)}>
          <FolderPlus size={15} />
        </IconButton>
        <IconButton label="Refresh" onClick={() => void wb.refreshTree()}>
          <RefreshCw size={14} />
        </IconButton>
        <IconButton label="Collapse All" onClick={() => wb.collapseAll()}>
          <ChevronsDownUp size={15} />
        </IconButton>
      </PanelHeader>
      <div className="tree" role="tree" onContextMenu={(e) => openMenu(e, null)}>
        {rootEditing && <InlineInput depth={0} kind={editing.kind} />}
        {tree.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} onMenu={openMenu} />
        ))}
        {tree.length === 0 && !rootEditing && <p className="panel-empty">This folder is empty.</p>}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.entry)}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}

function TreeNode({
  entry,
  depth,
  onMenu,
}: {
  entry: FileEntry;
  depth: number;
  onMenu: (e: React.MouseEvent, entry: FileEntry) => void;
}) {
  const { wb } = useWorkbench();
  const expanded = useAppState((s) => !!s.expanded[entry.path]);
  const active = useAppState((s) => s.active === entry.path);
  const dirty = useAppState((s) => isDirty(s.docs[entry.path]));
  const problems = useAppState((s) => s.problems[entry.path]);
  const editing = useAppState((s) => s.editing);
  const isDir = entry.kind === 'directory';

  if (editing?.kind === 'rename' && editing.path === entry.path) {
    return <InlineInput depth={depth} kind="rename" initial={entry.name} />;
  }

  const status = problems?.errors ? 'error' : problems?.warnings ? 'warning' : null;
  return (
    <>
      <div
        role="treeitem"
        aria-expanded={isDir ? expanded : undefined}
        aria-selected={active}
        tabIndex={0}
        className={`tree-row${active ? ' is-active' : ''}${status ? ` has-${status}` : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        title={entry.path}
        onClick={() => (isDir ? wb.toggleFolder(entry.path) : void wb.openFile(entry.path))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (isDir) wb.toggleFolder(entry.path);
            else void wb.openFile(entry.path);
          }
          if (event.key === 'F2') wb.startRename(entry.path);
          if (event.key === 'Delete') void wb.remove(entry.path);
        }}
        onContextMenu={(event) => onMenu(event, entry)}
      >
        {isDir ? (
          <ChevronRight size={14} className={`tree-chevron${expanded ? ' is-open' : ''}`} />
        ) : (
          <FileIcon name={entry.name} />
        )}
        <span className="tree-label">{entry.name}</span>
        {status && (
          <span className={`tree-count is-${status}`}>
            {problems!.errors || problems!.warnings}
          </span>
        )}
        {dirty && <span className="dirty-dot" aria-label="Unsaved changes" />}
      </div>
      {isDir && expanded && (
        <div role="group">
          {editing && editing.kind !== 'rename' && editing.parent === entry.path && (
            <InlineInput depth={depth + 1} kind={editing.kind} />
          )}
          {entry.children?.map((child) => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} onMenu={onMenu} />
          ))}
        </div>
      )}
    </>
  );
}

export function FileIcon({ name }: { name: string }) {
  if (MARKUP_FILE.test(name)) {
    return (
      <span className={`file-glyph${/\.md$/i.test(name) ? ' is-md' : ''}`} aria-hidden="true">
        M
      </span>
    );
  }
  return <FileText size={14} className="file-icon" aria-hidden="true" />;
}

function InlineInput({
  depth,
  kind,
  initial = '',
}: {
  depth: number;
  kind: 'new-file' | 'new-folder' | 'rename';
  initial?: string;
}) {
  const { wb } = useWorkbench();
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    // Select the name without its extension, like other editors.
    const dot = initial.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    void wb.commitEditing(ref.current?.value ?? '');
  };
  return (
    <div className="tree-row is-editing" style={{ paddingLeft: 8 + depth * 14 }}>
      {kind === 'new-folder' ? (
        <ChevronRight size={14} className="tree-chevron" />
      ) : (
        <FileIcon name={kind === 'new-file' ? 'x.markup' : initial} />
      )}
      <input
        ref={ref}
        className="tree-input"
        defaultValue={initial}
        placeholder={
          kind === 'new-folder' ? 'Folder name' : kind === 'new-file' ? 'name.markup' : ''
        }
        aria-label={
          kind === 'rename' ? 'New name' : kind === 'new-folder' ? 'Folder name' : 'File name'
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            done.current = true;
            wb.cancelEditing();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
