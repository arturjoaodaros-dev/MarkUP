/**
 * Anchors: the ids that `#fragment` links can target.
 *
 * Heading ids are part of the language, not of a renderer, so every tool agrees
 * on them: an explicit `{#id}` wins; otherwise the id is a slug of the heading
 * text (GitHub style), made unique with `-1`, `-2`… in document order.
 */
import type { Document, Heading, Node } from '../ast.ts';
import type { Range } from '../source/position.ts';
import { inlineText } from './text.ts';
import { visit } from './visit.ts';

export interface Anchor {
  id: string;
  /** Where the id is defined (the heading, or the attribute block). */
  range: Range;
  node: Node;
  explicit: boolean;
  /** Human-readable text (heading text, or the id itself). */
  text: string;
  /** Heading depth, for headings. */
  depth?: number;
}

/** GitHub-compatible slug: lowercase, punctuation removed, spaces to hyphens. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

export class Slugger {
  /** Every id handed out or reserved, mapped to the next suffix to try for it. */
  private readonly seen = new Map<string, number>();

  /** Reserves an id exactly as given (explicit ids). */
  reserve(id: string): void {
    if (!this.seen.has(id)) this.seen.set(id, 1);
  }

  slug(text: string): string {
    const base = slugify(text) || 'section';
    let result = base;
    const next = this.seen.get(base);
    if (next !== undefined) {
      let n = next;
      do {
        result = `${base}-${n}`;
        n++;
      } while (this.seen.has(result));
      this.seen.set(base, n);
    }
    this.seen.set(result, this.seen.get(result) ?? 1);
    return result;
  }
}

export interface AnchorIndex {
  anchors: Anchor[];
  byId: Map<string, Anchor>;
  /** Id of every heading, explicit or generated. */
  headingIds: Map<Heading, string>;
}

/** Computes every anchor in the document. */
export function collectAnchors(document: Document): AnchorIndex {
  const anchors: Anchor[] = [];
  const headingIds = new Map<Heading, string>();
  const slugger = new Slugger();
  const headings: Heading[] = [];

  // Explicit ids first, so generated slugs never collide with them.
  visit(document, (node) => {
    if (node.type === 'heading') headings.push(node);
    const attributes = 'attributes' in node ? node.attributes : null;
    if (attributes?.id) {
      slugger.reserve(attributes.id);
      const item = attributes.items.find((i) => i.kind === 'id' && i.value === attributes.id);
      anchors.push({
        id: attributes.id,
        range: item?.range ?? attributes.range,
        node,
        explicit: true,
        text: node.type === 'heading' ? inlineText(node.children) : attributes.id,
        depth: node.type === 'heading' ? node.depth : undefined,
      });
      if (node.type === 'heading') headingIds.set(node, attributes.id);
    }
  });
  for (const heading of headings) {
    if (headingIds.has(heading)) continue;
    const text = inlineText(heading.children);
    const id = slugger.slug(text);
    headingIds.set(heading, id);
    anchors.push({
      id,
      range: heading.position,
      node: heading,
      explicit: false,
      text,
      depth: heading.depth,
    });
  }
  anchors.sort((a, b) => a.range.start.offset - b.range.start.offset);
  const byId = new Map<string, Anchor>();
  for (const anchor of anchors) if (!byId.has(anchor.id)) byId.set(anchor.id, anchor);
  return { anchors, byId, headingIds };
}
