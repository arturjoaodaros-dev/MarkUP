// Porta de packages/desktop/Workspace/WorkspaceIndex.cs (fase WPF) — a
// diferença estrutural principal é que aqui a lógica de aplicação
// incremental (`applyBatch`) e reconciliação (`reconcileWithFreshScan`) são
// funções PURAS (estado → estado novo), sem I/O nem efeitos colaterais —
// mais fácil de testar que a versão C#, que misturava a varredura do disco
// com o diff. `scanWorkspace` (I/O real via @tauri-apps/plugin-fs) fica
// separado e não é testado aqui, do mesmo jeito que `WorkspaceService.BuildTree`
// nunca foi testado por unidade na fase WPF — só pela app rodando de verdade.
//
// Rename aparece como remove+create separados (não um evento de rename
// único — ver comentário em src-tauri/src/watcher.rs sobre por que). Uma
// aba aberta de um arquivo renomeado externamente vai passar por
// "removido externamente" (conteúdo preservado, nunca perdido) em vez de
// seguir o rename suavemente — limitação conhecida e registrada, não uma
// lacuna escondida.

import type { DocumentNode, WorkspaceChange, WorkspaceIndexState } from './workspaceTypes';

const MARKUP_EXTENSIONS = ['.markup', '.mkup'];
const IGNORED_DIR_NAMES = new Set(['.git', '.vs', '.vscode', 'node_modules', 'bin', 'obj']);
const SELF_WRITE_WINDOW_MS = 2000;

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function basenameOf(path: string): string {
  const n = normalize(path);
  const idx = n.lastIndexOf('/');
  return idx === -1 ? n : n.slice(idx + 1);
}

function dirnameOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx === -1 ? null : trimmed.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}

export function isMarkupFile(path: string): boolean {
  const base = basenameOf(path).toLowerCase();
  return MARKUP_EXTENSIONS.some((ext) => base.endsWith(ext));
}

export function isTempFile(name: string): boolean {
  return name.startsWith('.') && name.includes('.tmp-');
}

export function isIgnoredPath(rootPath: string, fullPath: string): boolean {
  const root = normalize(rootPath);
  const full = normalize(fullPath);
  const relative = full.startsWith(root) ? full.slice(root.length).replace(/^\//, '') : full;
  return relative.split('/').some((segment) => IGNORED_DIR_NAMES.has(segment));
}

function nameWithoutExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function createEmptyIndex(rootPath: string): WorkspaceIndexState {
  const root: DocumentNode = {
    name: basenameOf(rootPath) || rootPath,
    path: rootPath,
    isDirectory: true,
    childPaths: [],
  };
  return { rootPath, nodes: { [rootPath]: root } };
}

export interface ExternalChanges {
  changed: string[];
  removed: string[];
}

interface ApplyResult {
  state: WorkspaceIndexState;
  external: ExternalChanges;
}

/**
 * Aplica um lote de mudanças já coalescidas. Pura — devolve um estado novo,
 * nunca muta o argumento. `selfWritePaths` é o conjunto de caminhos que o
 * próprio app salvou há pouco (ver `SELF_WRITE_WINDOW_MS`) — usado pra não
 * disparar o fluxo de conflito por causa do eco do próprio save (a mesma
 * guarda que existia em C#, missão §14).
 */
export function applyBatch(
  state: WorkspaceIndexState,
  changes: WorkspaceChange[],
  selfWritePaths: ReadonlyMap<string, number>,
): ApplyResult {
  let nodes = { ...state.nodes };
  const external: ExternalChanges = { changed: [], removed: [] };

  const isRecentSelfWrite = (path: string): boolean => {
    const when = selfWritePaths.get(path);
    return when !== undefined && Date.now() - when < SELF_WRITE_WINDOW_MS;
  };

  const getOrCreateAncestor = (dir: string | null): DocumentNode | null => {
    if (dir === null) return null;
    const existing = nodes[dir];
    if (existing) return existing;
    if (normalize(dir) === normalize(state.rootPath)) return nodes[state.rootPath] ?? null;

    const parent = getOrCreateAncestor(dirnameOf(dir));
    if (!parent) return null;

    const node: DocumentNode = { name: basenameOf(dir), path: dir, isDirectory: true, childPaths: [] };
    nodes[dir] = node;
    nodes[parent.path] = { ...parent, childPaths: [...parent.childPaths, dir] };
    return node;
  };

  const removeSubtree = (path: string) => {
    const node = nodes[path];
    if (!node) return;
    for (const child of node.childPaths) removeSubtree(child);
    delete nodes[path];
    const parentPath = dirnameOf(path);
    if (parentPath && nodes[parentPath]) {
      nodes[parentPath] = { ...nodes[parentPath], childPaths: nodes[parentPath].childPaths.filter((p) => p !== path) };
    }
  };

  const applyCreated = (path: string, isDirectoryHint?: boolean) => {
    if (isIgnoredPath(state.rootPath, path)) return;
    if (nodes[path]) {
      applyChanged(path);
      return;
    }

    // O Rust já diz se é pasta ou arquivo (Path::is_dir() no instante do
    // evento) — só cai pra heurística de extensão quando essa informação
    // não veio (ex.: reconciliação, que não tem WorkspaceChange nenhum,
    // só compara conjuntos de caminhos já classificados pelo scan).
    const isDirectory = isDirectoryHint ?? !isMarkupFile(path);
    if (!isDirectory && !isMarkupFile(path)) return;

    const dir = dirnameOf(path);
    const parent = getOrCreateAncestor(dir);
    if (!parent) return;

    const node: DocumentNode = { name: basenameOf(path), path, isDirectory, childPaths: [] };
    nodes[path] = node;
    nodes[parent.path] = { ...parent, childPaths: [...parent.childPaths, path] };
  };

  const applyChanged = (path: string) => {
    if (!nodes[path]) {
      applyCreated(path);
      return;
    }
    if (isRecentSelfWrite(path)) return;
    external.changed.push(path);
  };

  const applyRemoved = (path: string) => {
    if (!nodes[path]) return;
    removeSubtree(path);
    external.removed.push(path);
  };

  for (const change of changes) {
    if (change.kind === 'created') applyCreated(change.path, change.isDirectory);
    else if (change.kind === 'modified') applyChanged(change.path);
    else applyRemoved(change.path);
  }

  return { state: { rootPath: state.rootPath, nodes }, external };
}

/** Reconcilia contra um scan fresco (fornecido pelo chamador, via I/O real) — segunda linha de defesa contra eventos perdidos (missão §34). */
export function reconcileWithFreshScan(state: WorkspaceIndexState, fresh: WorkspaceIndexState): ApplyResult {
  const changes: WorkspaceChange[] = [];
  for (const path of Object.keys(state.nodes)) {
    if (!fresh.nodes[path]) changes.push({ kind: 'removed', path });
  }
  for (const path of Object.keys(fresh.nodes)) {
    // O scan fresco já sabe se é pasta ou arquivo — não precisa da
    // heurística de extensão que `applyCreated` usa como último recurso.
    if (!state.nodes[path]) changes.push({ kind: 'created', path, isDirectory: fresh.nodes[path].isDirectory });
  }
  return applyBatch(state, changes, new Map());
}

export function search(state: WorkspaceIndexState, query: string): DocumentNode[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return Object.values(state.nodes)
    .filter((n) => !n.isDirectory && n.name.toLowerCase().includes(trimmed))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveWikiLink(state: WorkspaceIndexState, target: string): { exists: boolean; path?: string } {
  const needle = target.toLowerCase();
  for (const node of Object.values(state.nodes)) {
    if (!node.isDirectory && nameWithoutExtension(node.name).toLowerCase() === needle) {
      return { exists: true, path: node.path };
    }
  }
  return { exists: false };
}

export function getFileList(state: WorkspaceIndexState): { name: string; path: string }[] {
  return Object.values(state.nodes)
    .filter((n) => !n.isDirectory)
    .map((n) => ({ name: nameWithoutExtension(n.name), path: n.path }));
}

export { joinPath, dirnameOf };
