// Varredura real do disco (I/O via @tauri-apps/plugin-fs) — separado de
// workspaceIndex.ts de propósito: isso não é testável por unidade sem um
// runtime Tauri de verdade (mesma situação de WorkspaceService.BuildTree na
// fase WPF, nunca coberto por teste de unidade lá também), então mantém a
// parte pura (applyBatch/reconcileWithFreshScan) livre dessa dependência.

import { readDir } from '@tauri-apps/plugin-fs';
import type { DocumentNode, WorkspaceIndexState } from './workspaceTypes';
import { basenameOf, isIgnoredPath, isMarkupFile, isTempFile, joinPath } from './workspaceIndex';

export async function scanWorkspace(rootPath: string): Promise<WorkspaceIndexState> {
  const nodes: Record<string, DocumentNode> = {};

  const root: DocumentNode = { name: basenameOf(rootPath) || rootPath, path: rootPath, isDirectory: true, childPaths: [] };
  nodes[rootPath] = root;

  await populate(rootPath, rootPath, root, nodes);
  return { rootPath, nodes };
}

async function populate(
  rootPath: string,
  dirPath: string,
  node: DocumentNode,
  nodes: Record<string, DocumentNode>,
): Promise<void> {
  let entries;
  try {
    entries = await readDir(dirPath);
  } catch {
    // Pasta sem permissão ou temporariamente inacessível — não derruba o
    // workspace inteiro (missão §110), só essa subárvore fica vazia.
    return;
  }

  const dirs = entries.filter((e) => e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter((e) => e.isFile && isMarkupFile(e.name) && !isTempFile(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of dirs) {
    const path = joinPath(dirPath, entry.name);
    if (isIgnoredPath(rootPath, path)) continue;

    const childNode: DocumentNode = { name: entry.name, path, isDirectory: true, childPaths: [] };
    nodes[path] = childNode;
    node.childPaths.push(path);
    await populate(rootPath, path, childNode, nodes);
  }

  for (const entry of files) {
    const path = joinPath(dirPath, entry.name);
    nodes[path] = { name: entry.name, path, isDirectory: false, childPaths: [] };
    node.childPaths.push(path);
  }
}
