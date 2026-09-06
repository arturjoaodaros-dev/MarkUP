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

/** Concatena o texto visível de um conjunto de nós inline, sem marcação — usado para `title`, slugs de âncora etc. */
export function inlineText(nodes: InlineNode[]): string {
  return plainText(nodes);
}

/**
 * Slug de âncora no mesmo estilo do GitHub: minúsculas, espaços viram `-`,
 * pontuação fora de `[a-z0-9_-]` é removida. `seen` (opcional, um `Map`
 * reutilizado entre chamadas) desambigua headings com o mesmo texto
 * anexando `-1`, `-2` etc., a mesma convenção do GitHub.
 */
export function slugifyHeading(text: string, seen?: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}_\- ]+/gu, '')
      .replace(/\s+/g, '-') || 'secao';

  if (!seen) return base;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
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

/**
 * Encontra o nó mais interno cujo intervalo de posição contém `offset`.
 * Como `visit` é pré-ordem (pai antes dos filhos), o último nó que casa é
 * sempre o mais profundo — não precisa de lógica de "melhor candidato".
 * Usado por hover e pela sincronização editor↔preview: sempre a posição
 * real da AST, nunca busca de texto.
 */
export function findNodeAtOffset(doc: Document, offset: number): MarkupNode | null {
  let match: MarkupNode | null = null;
  visit(doc, (node) => {
    if (offset >= node.position.start.offset && offset <= node.position.end.offset) {
      match = node;
    }
  });
  return match;
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
