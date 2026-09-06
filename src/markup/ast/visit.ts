import type { BlockNode, Document, InlineNode, MarkupNode } from './nodes';

// Travessia genérica e somente-leitura da AST. Usada pela sidebar (extrair
// headings), pelo exportador e por qualquer ferramenta futura que precise
// varrer o documento sem conhecer cada tipo de nó individualmente.
export function visit(node: MarkupNode, callback: (node: MarkupNode) => void): void {
  callback(node);

  switch (node.type) {
    case 'document':
      for (const child of node.children) visit(child, callback);
      return;
    case 'heading':
    case 'paragraph':
    case 'strong':
    case 'emphasis':
    case 'link':
      for (const child of node.children) visit(child, callback);
      return;
    case 'list':
      for (const item of node.items) visit(item, callback);
      return;
    case 'listItem':
    case 'blockquote':
      for (const child of node.children) visit(child, callback);
      return;
    case 'table':
      visit(node.header, callback);
      for (const row of node.rows) visit(row, callback);
      return;
    case 'tableRow':
      for (const cell of node.cells) visit(cell, callback);
      return;
    case 'tableCell':
      for (const child of node.children) visit(child, callback);
      return;
    case 'card':
    case 'alert':
      for (const child of node.children) visit(child, callback);
      return;
    case 'tabs':
      for (const tab of node.tabs) {
        for (const child of tab.children) visit(child, callback);
      }
      return;
    default:
      // Nós folha: text, inlineCode, image, break, codeBlock, thematicBreak,
      // chart, progress, math, unknownDirective.
      return;
  }
}

export function collectHeadings(doc: Document): Array<{ depth: number; text: string }> {
  const headings: Array<{ depth: number; text: string }> = [];
  for (const child of doc.children) {
    if (child.type === 'heading') {
      headings.push({ depth: child.depth, text: plainText(child.children) });
    }
  }
  return headings;
}

function plainText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
        case 'inlineCode':
          return n.value;
        case 'strong':
        case 'emphasis':
        case 'link':
          return plainText(n.children);
        case 'image':
          return n.alt;
        default:
          return '';
      }
    })
    .join('');
}

export function isBlockContainer(
  node: MarkupNode,
): node is Extract<MarkupNode, { children: BlockNode[] }> {
  return (
    node.type === 'blockquote' ||
    node.type === 'listItem' ||
    node.type === 'card' ||
    node.type === 'alert'
  );
}
