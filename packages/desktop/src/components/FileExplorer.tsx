import { useState } from 'react';
import { ChevronRight, File as FileIcon, Folder, FolderOpen } from 'lucide-react';
import { useAppStore } from '../state/appStore';
import type { DocumentNode, WorkspaceIndexState } from '../state/workspaceTypes';
import { useContextMenu } from './ContextMenu';

interface FileExplorerProps {
  workspace: WorkspaceIndexState;
  activeFilePath: string | null;
  onOpenFile: (path: string) => void;
}

/**
 * Árvore de arquivos de verdade (missão §10): hierarquia real, indentação
 * por profundidade, expandir/colapsar, seleção evidente sem exagero (fundo
 * tingido, não bloco sólido — mesma lição já aprendida no redesign WPF).
 */
export function FileExplorer({ workspace, activeFilePath, onOpenFile }: FileExplorerProps) {
  const root = workspace.nodes[workspace.rootPath];
  if (!root) return null;
  return (
    <div className="mkd-tree">
      {root.childPaths.map((path) => (
        <TreeNode key={path} node={workspace.nodes[path]} workspace={workspace} depth={0} activeFilePath={activeFilePath} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  workspace,
  depth,
  activeFilePath,
  onOpenFile,
}: {
  node: DocumentNode;
  workspace: WorkspaceIndexState;
  depth: number;
  activeFilePath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const { openMenu, ContextMenuPortal } = useContextMenu();
  const requestDelete = useAppStore((s) => s.requestDelete);
  const requestRename = useAppStore((s) => s.requestRename);

  const indent = 6 + depth * 14;

  if (node.isDirectory) {
    return (
      <div>
        <div
          className="mkd-tree-row"
          style={{ paddingLeft: indent }}
          onClick={() => setExpanded((e) => !e)}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu(e.clientX, e.clientY, [
              { label: 'Renomear', onSelect: () => requestRename(node.path) },
              { label: 'Excluir', destructive: true, onSelect: () => requestDelete(node.path) },
            ]);
          }}
        >
          <span className="mkd-tree-chevron" data-expanded={expanded}>
            <ChevronRight size={13} />
          </span>
          <span className="mkd-tree-icon">
            {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
          <span className="mkd-tree-label">{node.name}</span>
        </div>
        {expanded &&
          node.childPaths.map((path) => (
            <TreeNode
              key={path}
              node={workspace.nodes[path]}
              workspace={workspace}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onOpenFile={onOpenFile}
            />
          ))}
        {ContextMenuPortal}
      </div>
    );
  }

  return (
    <div
      className="mkd-tree-row"
      style={{ paddingLeft: indent + 16 }}
      data-selected={node.path === activeFilePath}
      onClick={() => onOpenFile(node.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, [
          { label: 'Abrir', onSelect: () => onOpenFile(node.path) },
          { label: 'Renomear', onSelect: () => requestRename(node.path) },
          { label: 'Excluir', destructive: true, onSelect: () => requestDelete(node.path) },
        ]);
      }}
    >
      <span className="mkd-tree-icon">
        <FileIcon size={14} />
      </span>
      <span className="mkd-tree-label">{node.name}</span>
      {ContextMenuPortal}
    </div>
  );
}
