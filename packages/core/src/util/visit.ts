import type { Node } from '../ast.ts';

/** Direct children of a node, including directive labels. */
export function childrenOf(node: Node): readonly Node[] {
  switch (node.type) {
    case 'document':
    case 'blockquote':
    case 'list':
    case 'listItem':
    case 'footnoteDefinition':
    case 'paragraph':
    case 'heading':
    case 'table':
    case 'tableRow':
    case 'tableCell':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'link':
      return node.children;
    case 'containerDirective': {
      const label = node.label ?? [];
      return node.body.kind === 'flow' ? [...label, ...node.body.children] : label;
    }
    case 'leafDirective':
    case 'inlineDirective':
      return node.label ?? [];
    default:
      return [];
  }
}

export type VisitResult = void | 'skip' | 'stop';

export type Visitor = (node: Node, ancestors: readonly Node[]) => VisitResult;

/**
 * Depth-first, pre-order traversal. Return `'skip'` to not descend into a node,
 * `'stop'` to end the traversal. Iterative, so deep trees cannot overflow the stack.
 */
export function visit(root: Node, visitor: Visitor): void {
  const stack: { node: Node; ancestors: Node[] }[] = [{ node: root, ancestors: [] }];
  while (stack.length > 0) {
    const { node, ancestors } = stack.pop()!;
    const result = visitor(node, ancestors);
    if (result === 'stop') return;
    if (result === 'skip') continue;
    const children = childrenOf(node);
    if (children.length === 0) continue;
    const next = [...ancestors, node];
    for (let i = children.length - 1; i >= 0; i--)
      stack.push({ node: children[i]!, ancestors: next });
  }
}

/** All nodes of a given type, in document order. */
export function selectAll<T extends Node['type']>(
  root: Node,
  type: T,
): Extract<Node, { type: T }>[] {
  const out: Extract<Node, { type: T }>[] = [];
  visit(root, (node) => {
    if (node.type === type) out.push(node as Extract<Node, { type: T }>);
  });
  return out;
}
