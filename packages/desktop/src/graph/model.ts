/**
 * The document graph: MarkUP files as nodes, links between them as edges.
 * Links are found by the language service (`getDocumentLinks`), the same code
 * that makes them clickable in VS Code, so the graph follows the language.
 */
import { linkedDocument } from '@markup-lang/language-service';
import { basename, dirname, join, normalize } from '../fs/types.ts';

export interface GraphNode {
  /** The file path. */
  id: string;
  label: string;
  /** Linked to but not in the workspace. */
  missing: boolean;
  /** Number of distinct documents it is connected to. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface DocumentGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The workspace path a link in `from` points at, or null when it is not a MarkUP document. */
export function resolveLink(from: string, target: string, root: string): string | null {
  const path = linkedDocument(target);
  if (path === null || path === '') return null;
  return normalize(path.startsWith('/') ? join(root, path) : join(dirname(from), path));
}

/**
 * Builds the graph from each file's resolved link targets. Edges are
 * undirected and unique; links to the document itself are ignored.
 */
export function buildGraph(
  files: readonly string[],
  links: Readonly<Record<string, readonly string[]>>,
): DocumentGraph {
  const known = new Set(files);
  const nodes = new Map<string, GraphNode>();
  const add = (id: string, missing: boolean) => {
    let node = nodes.get(id);
    if (!node) nodes.set(id, (node = { id, label: basename(id), missing, degree: 0 }));
    return node;
  };
  for (const file of files) add(file, false);

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    for (const target of links[file] ?? []) {
      if (target === file) continue;
      const key = file < target ? `${file}\n${target}` : `${target}\n${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add(target, !known.has(target));
      nodes.get(file)!.degree++;
      nodes.get(target)!.degree++;
      edges.push({ source: file, target });
    }
  }
  return { nodes: [...nodes.values()], edges };
}
