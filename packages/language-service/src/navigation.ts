import { normalizeLabel, type Diagnostic, type TextEdit } from '@markup-lang/core';
import type { Analysis } from './analysis.ts';

export interface Location {
  from: number;
  to: number;
}

/** Go to definition: `#anchor` links, reference links and footnotes. */
export function getDefinition(analysis: Analysis, offset: number): Location | null {
  const path = analysis.pathAt(offset);
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i]!;
    if (node.type === 'link' || node.type === 'image') {
      if (node.url.startsWith('#')) {
        let id = node.url.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {
          // Keep the raw fragment.
        }
        const anchor = analysis.anchors.byId.get(id);
        if (anchor) return { from: anchor.range.start.offset, to: anchor.range.end.offset };
      }
      if (node.type === 'link' && node.kind === 'reference') {
        const source = analysis.text.slice(node.position.start.offset, node.position.end.offset);
        const label = /\]\[([^\]]+)\]$/.exec(source)?.[1] ?? /^\[(.*?)\](?:\[\])?$/s.exec(source)?.[1];
        const def = label ? analysis.definitions().get(normalizeLabel(label)) : undefined;
        if (def) return { from: def.position.start.offset, to: def.position.end.offset };
      }
    }
    if (node.type === 'footnoteReference') {
      const def = analysis.footnotes().get(node.identifier);
      if (def) return { from: def.position.start.offset, to: def.position.end.offset };
    }
  }
  return null;
}

/** Every reference to the anchor, footnote or link definition under the cursor. */
export function getReferences(analysis: Analysis, offset: number): Location[] {
  const target = getDefinition(analysis, offset) ?? { from: offset, to: offset };
  const out: Location[] = [];
  for (const { node } of analysis.nodes()) {
    if (node.type !== 'link' && node.type !== 'footnoteReference') continue;
    const def = getDefinition(analysis, node.position.start.offset + 1);
    if (def && def.from <= target.from && target.from <= def.to) out.push({ from: node.position.start.offset, to: node.position.end.offset });
  }
  return out;
}

export interface DocumentLink {
  from: number;
  to: number;
  /** The URL as written; hosts resolve relative targets against the document. */
  target: string;
}

export function getDocumentLinks(analysis: Analysis): DocumentLink[] {
  const links: DocumentLink[] = [];
  for (const { node } of analysis.nodes()) {
    // Reference links are covered by their definition.
    if (node.type === 'link' && node.kind === 'reference') continue;
    if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && node.url && !node.url.startsWith('#')) {
      const source = analysis.text.slice(node.position.start.offset, node.position.end.offset);
      const at = source.lastIndexOf(node.url);
      const from = at === -1 ? node.position.start.offset : node.position.start.offset + at;
      links.push({ from, to: at === -1 ? node.position.end.offset : from + node.url.length, target: node.url });
    }
  }
  return links;
}

export interface CodeAction {
  title: string;
  edits: TextEdit[];
  preferred: boolean;
  diagnostic: Diagnostic;
}

/** Quick fixes from diagnostics that overlap the given range. */
export function getCodeActions(analysis: Analysis, from: number, to: number): CodeAction[] {
  const actions: CodeAction[] = [];
  for (const diagnostic of analysis.diagnostics) {
    const { start, end } = diagnostic.range;
    if (end.offset < from || start.offset > to) continue;
    for (const fix of diagnostic.fixes ?? []) actions.push({ title: fix.title, edits: fix.edits, preferred: !!fix.preferred, diagnostic });
  }
  return actions;
}
