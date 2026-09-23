import {
  inlineText,
  isDirective,
  textContent,
  type DataNode,
  type Range,
  type Schema,
} from '@markup-lang/core';
import type { Analysis } from './analysis.ts';
import { attributeDocs, directiveDocs } from './docs.ts';

export interface Hover {
  from: number;
  to: number;
  /** Markdown. */
  contents: string;
}

const within = (range: Range | null | undefined, offset: number) =>
  !!range && range.start.offset <= offset && offset <= range.end.offset;

export function getHover(analysis: Analysis, offset: number): Hover | null {
  const path = analysis.pathAt(offset);
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i]!;
    if (isDirective(node)) {
      const spec = analysis.registry.get(node.name);
      if (within(node.nameRange, offset)) {
        const contents = spec
          ? directiveDocs(spec)
          : `**${node.name}** — unknown component.\n\nIt is rendered as a plain container. Register it with a plugin to give it meaning.`;
        return { from: node.nameRange.start.offset, to: node.nameRange.end.offset, contents };
      }
      for (const item of node.attributes?.items ?? []) {
        if (
          within(item.range, offset) &&
          item.nameRange &&
          spec?.attributes &&
          Object.hasOwn(spec.attributes, item.name)
        ) {
          return {
            from: item.range.start.offset,
            to: item.range.end.offset,
            contents: attributeDocs(item.name, spec.attributes[item.name]!),
          };
        }
      }
      if (
        node.type === 'containerDirective' &&
        node.body.kind === 'data' &&
        node.body.value &&
        spec?.data
      ) {
        const hit = dataKeyAt(node.body.value, spec.data, offset);
        if (hit) return hit;
      }
    }
    if (node.type === 'link' && node.url.startsWith('#')) {
      const anchor = analysis.anchors.byId.get(safeDecode(node.url.slice(1)));
      if (anchor) {
        return {
          from: node.position.start.offset,
          to: node.position.end.offset,
          contents: `Links to ${anchor.depth ? `heading **${anchor.text}** (line ${anchor.range.start.line})` : `\`#${anchor.id}\` (line ${anchor.range.start.line})`}`,
        };
      }
    }
    if (node.type === 'footnoteReference') {
      const def = analysis.footnotes().get(node.identifier);
      return {
        from: node.position.start.offset,
        to: node.position.end.offset,
        contents: def
          ? `**[^${def.label}]** ${textContent(def)}`
          : `Footnote \`[^${node.label}]\` is not defined.`,
      };
    }
    if (node.type === 'heading' && node.attributes?.id) {
      return {
        from: node.position.start.offset,
        to: node.position.end.offset,
        contents: `Heading \`#${node.attributes.id}\`: ${inlineText(node.children)}`,
      };
    }
  }
  return null;
}

/** Hover on a key of a data body: its schema documentation. */
function dataKeyAt(root: DataNode, schema: Schema, offset: number): Hover | null {
  const stack: { node: DataNode; schema: Schema | null }[] = [{ node: root, schema }];
  while (stack.length) {
    const { node, schema: s } = stack.pop()!;
    if (node.kind === 'map') {
      for (const entry of node.entries) {
        const child =
          s?.kind === 'object'
            ? Object.hasOwn(s.properties, entry.key)
              ? s.properties[entry.key]!
              : null
            : s?.kind === 'record'
              ? s.values
              : null;
        if (within(entry.keyRange, offset) && child) {
          return {
            from: entry.keyRange.start.offset,
            to: entry.keyRange.end.offset,
            contents: attributeDocs(entry.key, child),
          };
        }
        stack.push({ node: entry.value, schema: child });
      }
    } else if (node.kind === 'seq') {
      for (const item of node.items)
        stack.push({ node: item, schema: s?.kind === 'array' ? s.items : null });
    }
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
