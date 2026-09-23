import { parse, type Diagnostic, type Node, type ParseOptions } from '@markup-lang/core';

/**
 * A compact, readable serialisation of a tree, used in assertions:
 *
 *   p("a ", strong("b"))  h2("Title")  ul(li(p("x")))  :::note(p("hi"))
 */
export function tree(source: string, options?: ParseOptions): string {
  const { document } = parse(source, options);
  return document.children.map(show).join(' ');
}

export function inline(source: string): string {
  const { document } = parse(source);
  const first = document.children[0];
  if (!first || first.type !== 'paragraph') return `<no paragraph: ${first?.type}>`;
  return first.children.map(show).join(' ');
}

export function show(node: Node): string {
  const kids = (nodes: readonly Node[]) => nodes.map(show).join(', ');
  switch (node.type) {
    case 'text':
      return JSON.stringify(node.value);
    case 'inlineCode':
      return `code(${JSON.stringify(node.value)})`;
    case 'break':
      return 'br';
    case 'emphasis':
      return `em(${kids(node.children)})`;
    case 'strong':
      return `strong(${kids(node.children)})`;
    case 'delete':
      return `del(${kids(node.children)})`;
    case 'link':
      return `link[${node.url}${node.title ? ` "${node.title}"` : ''}](${kids(node.children)})`;
    case 'image':
      return `img[${node.url} alt=${JSON.stringify(node.alt)}${node.attributes ? ` ${attrs(node.attributes.values, node.attributes.id, node.attributes.classes)}` : ''}]`;
    case 'footnoteReference':
      return `fnref[${node.label}]`;
    case 'comment':
      return `comment(${JSON.stringify(node.value)})`;
    case 'inlineDirective':
      return `:${node.name}${node.label ? `[${kids(node.label)}]` : ''}${node.attributes ? attrs(node.attributes.values, node.attributes.id, node.attributes.classes) : ''}`;
    case 'paragraph':
      return `p(${kids(node.children)})`;
    case 'heading':
      return `h${node.depth}${node.attributes ? attrs(node.attributes.values, node.attributes.id, node.attributes.classes) : ''}(${kids(node.children)})`;
    case 'thematicBreak':
      return 'hr';
    case 'blockquote':
      return `quote(${kids(node.children)})`;
    case 'list':
      return `${node.ordered ? `ol${node.start !== 1 ? `[${node.start}]` : ''}` : 'ul'}${node.spread ? '*' : ''}(${kids(node.children)})`;
    case 'listItem':
      return `li${node.checked === null ? '' : node.checked ? '[x]' : '[ ]'}(${kids(node.children)})`;
    case 'code':
      return `pre${node.lang ? `[${node.lang}]` : ''}${node.meta ? `{meta=${node.meta}}` : ''}${node.attributes ? attrs(node.attributes.values, node.attributes.id, node.attributes.classes) : ''}(${JSON.stringify(node.value)})`;
    case 'table':
      return `table[${node.align.map((a) => a ?? '-').join(',')}](${kids(node.children)})`;
    case 'tableRow':
      return `${node.head ? 'th' : 'tr'}(${kids(node.children)})`;
    case 'tableCell':
      return `td(${kids(node.children)})`;
    case 'definition':
      return `def[${node.label} -> ${node.url}${node.title ? ` "${node.title}"` : ''}]`;
    case 'footnoteDefinition':
      return `fn[${node.label}](${kids(node.children)})`;
    case 'leafDirective':
      return `::${node.name}${node.label ? `[${kids(node.label)}]` : ''}${node.attributes ? attrs(node.attributes.values, node.attributes.id, node.attributes.classes) : ''}`;
    case 'containerDirective': {
      const head = `${':'.repeat(node.fence)}${node.name}${node.label ? `[${kids(node.label)}]` : ''}${node.attributes ? attrs(node.attributes.values, node.attributes.id, node.attributes.classes) : ''}`;
      const body =
        node.body.kind === 'flow'
          ? kids(node.body.children)
          : node.body.kind === 'raw'
            ? `raw ${JSON.stringify(node.body.value)}`
            : `data ${JSON.stringify(node.body.raw)}`;
      return `${head}(${body})`;
    }
    case 'document':
      return kids(node.children);
    default:
      return node.type;
  }
}

function attrs(
  values: Record<string, string | true>,
  id: string | null,
  classes: string[],
): string {
  const parts: string[] = [];
  if (id) parts.push(`#${id}`);
  for (const c of classes) parts.push(`.${c}`);
  for (const [k, v] of Object.entries(values)) parts.push(v === true ? k : `${k}=${v}`);
  return `{${parts.join(' ')}}`;
}

export function diagnostics(source: string, options?: ParseOptions): Diagnostic[] {
  return parse(source, options).diagnostics;
}

/** Diagnostics as `CODE line:col` strings. */
export function codes(source: string, options?: ParseOptions): string[] {
  return diagnostics(source, options).map(
    (d) => `${d.code} ${d.range.start.line}:${d.range.start.column}`,
  );
}

export function codeList(source: string, options?: ParseOptions): string[] {
  return diagnostics(source, options).map((d) => d.code);
}
