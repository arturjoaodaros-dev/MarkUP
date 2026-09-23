/**
 * Plain-text rendering of a MarkUP tree — a second renderer next to HTML. Used
 * for word counts, search indexes, previews and `markup render --format text`.
 */
import {
  createRegistry,
  toPlainData,
  type Block,
  type Directive,
  type DirectiveRegistry,
  type Document,
  type Inline,
  type MarkupPlugin,
} from '@markup-lang/core';

export type TextComponent = (node: Directive, ctx: TextContext) => string;

export interface TextContext {
  blocks(nodes: readonly Block[]): string;
  inlines(nodes: readonly Inline[]): string;
  label(node: Directive): string;
  body(node: Directive): string;
  registry: DirectiveRegistry;
}

export interface TextOptions {
  plugins?: readonly MarkupPlugin[];
  components?: Readonly<Record<string, TextComponent>>;
}

const CALLOUTS = new Set(['note', 'tip', 'important', 'warning', 'caution']);

const BUILTIN: Record<string, TextComponent> = {
  chart(node, ctx) {
    const data = node.type === 'containerDirective' && node.body.kind === 'data' ? toPlainData(node.body.value) : null;
    const lines: string[] = [];
    const title = ctx.label(node) || (data && typeof data === 'object' && !Array.isArray(data) && typeof data.title === 'string' ? data.title : '');
    if (title) lines.push(title);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const single = data.data;
      if (single && typeof single === 'object' && !Array.isArray(single)) {
        for (const [k, v] of Object.entries(single)) lines.push(`${k}: ${String(v)}`);
      } else if (Array.isArray(data.labels) && Array.isArray(data.series)) {
        for (const s of data.series) {
          if (s && typeof s === 'object' && !Array.isArray(s)) {
            const values = Array.isArray(s.values) ? s.values : [];
            lines.push(`${String(s.name)}: ${data.labels.map((l, i) => `${String(l)} ${String(values[i] ?? '')}`).join(', ')}`);
          }
        }
      }
    }
    return lines.join('\n');
  },
  kbd: (node) => node.rawLabel ?? '',
  progress(node, ctx) {
    const value = Number(node.attributes?.values.value ?? 0);
    const max = Number(node.attributes?.values.max ?? 100) || 100;
    const label = ctx.label(node);
    return `${label ? `${label}: ` : ''}${Math.round((value / max) * 100)}%`;
  },
  toc: () => '',
  tabs: (node, ctx) => ctx.body(node),
  tab: (node, ctx) => [ctx.label(node), ctx.body(node)].filter(Boolean).join('\n\n'),
};

export function renderText(document: Document, options: TextOptions = {}): string {
  const plugins = options.plugins ?? [];
  const registry = createRegistry(plugins);
  const components: Record<string, TextComponent> = { ...BUILTIN };
  for (const plugin of plugins) Object.assign(components, (plugin.renderers?.text ?? {}) as Record<string, TextComponent>);
  Object.assign(components, options.components ?? {});

  const ctx: TextContext = {
    registry,
    blocks: (nodes) =>
      nodes
        .map(block)
        .filter((text) => text.length > 0)
        .join('\n\n'),
    inlines: (nodes) => nodes.map(inline).join(''),
    label: (node) => (node.label ? ctx.inlines(node.label) : ''),
    body: (node) => (node.type === 'containerDirective' && node.body.kind === 'flow' ? ctx.blocks(node.body.children) : ''),
  };

  function directive(node: Directive): string {
    const component = Object.hasOwn(components, node.name) ? components[node.name] : undefined;
    if (component) return component(node, ctx);
    if (CALLOUTS.has(node.name)) {
      const title = ctx.label(node) || node.name[0]!.toUpperCase() + node.name.slice(1);
      return `${title}: ${ctx.body(node)}`;
    }
    if (node.type === 'containerDirective' && node.body.kind === 'raw') return node.body.value;
    return [ctx.label(node), ctx.body(node)].filter(Boolean).join('\n\n');
  }

  function block(node: Block): string {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        return ctx.inlines(node.children).trim();
      case 'thematicBreak':
      case 'comment':
      case 'definition':
        return '';
      case 'blockquote':
        return ctx.blocks(node.children);
      case 'list':
        return node.children
          .map((item, i) => {
            const marker = node.ordered ? `${(node.start ?? 1) + i}.` : '-';
            const text = ctx.blocks(item.children).replace(/\n/g, '\n   ');
            return `${marker} ${item.checked === null ? '' : item.checked ? '[x] ' : '[ ] '}${text}`;
          })
          .join('\n');
      case 'code':
        return node.value;
      case 'table':
        return node.children.map((row) => row.children.map((cell) => ctx.inlines(cell.children)).join('\t')).join('\n');
      case 'footnoteDefinition':
        return `[${node.label}] ${ctx.blocks(node.children)}`;
      case 'containerDirective':
      case 'leafDirective':
        return directive(node);
    }
  }

  function inline(node: Inline): string {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
        return node.value;
      case 'break':
        return '\n';
      case 'image':
        return node.alt;
      case 'comment':
        return '';
      case 'footnoteReference':
        return `[${node.label}]`;
      case 'inlineDirective':
        return directive(node);
      default:
        return ctx.inlines(node.children);
    }
  }

  return ctx.blocks(document.children);
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

/** Counts words; uses Intl.Segmenter when available so CJK text is counted sensibly. */
export function countWords(text: string): number {
  if (segmenter) {
    let count = 0;
    for (const segment of segmenter.segment(text)) if (segment.isWordLike) count++;
    return count;
  }
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
