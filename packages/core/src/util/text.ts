import type { Inline, Node } from '../ast.ts';
import { plainText } from '../parser/inline.ts';
import { childrenOf } from './visit.ts';

/** The plain text of inline content. */
export function inlineText(nodes: readonly Inline[]): string {
  return plainText(nodes);
}

/** The plain text of any node (blocks are joined with newlines). */
export function textContent(node: Node): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
      return node.value;
    case 'image':
      return node.alt;
    case 'break':
      return '\n';
    case 'comment':
    case 'definition':
    case 'thematicBreak':
    case 'frontMatter':
    case 'footnoteReference':
      return '';
    case 'containerDirective':
      if (node.body.kind === 'raw') return node.body.value;
      if (node.body.kind === 'data') return '';
      return childrenOf(node).map(textContent).filter(Boolean).join('\n');
    case 'paragraph':
    case 'heading':
    case 'tableCell':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'link':
    case 'inlineDirective':
    case 'leafDirective':
      return childrenOf(node).map(textContent).join('');
    case 'tableRow':
      return childrenOf(node).map(textContent).join('\t');
    default:
      return childrenOf(node).map(textContent).filter(Boolean).join('\n');
  }
}
