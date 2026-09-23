import { inlineText, type Node } from '@markup-lang/core';
import type { Analysis } from './analysis.ts';

export interface DocumentSymbol {
  name: string;
  detail: string;
  kind: 'heading' | 'component' | 'frontMatter';
  /** Heading depth (1–6) or nesting for components. */
  level: number;
  from: number;
  to: number;
  selectionFrom: number;
  selectionTo: number;
  children: DocumentSymbol[];
}

/**
 * The outline: headings nest by level; container components nest inside the
 * heading section (and component) that contains them.
 */
export function getSymbols(analysis: Analysis): DocumentSymbol[] {
  const roots: DocumentSymbol[] = [];
  const headingStack: DocumentSymbol[] = [];
  const text = analysis.text;
  const fm = analysis.document.frontMatter;
  if (fm) {
    roots.push({
      name: 'Front matter',
      detail: '',
      kind: 'frontMatter',
      level: 0,
      from: fm.position.start.offset,
      to: fm.position.end.offset,
      selectionFrom: fm.position.start.offset,
      selectionTo: fm.position.start.offset + 3,
      children: [],
    });
  }
  const componentStack: { symbol: DocumentSymbol; end: number }[] = [];

  const attach = (symbol: DocumentSymbol) => {
    while (componentStack.length && componentStack[componentStack.length - 1]!.end < symbol.from)
      componentStack.pop();
    const component = componentStack[componentStack.length - 1];
    const heading = headingStack[headingStack.length - 1];
    if (component && (!heading || component.symbol.from > heading.from))
      component.symbol.children.push(symbol);
    else if (heading) heading.children.push(symbol);
    else roots.push(symbol);
  };

  for (const { node } of analysis.nodes()) {
    if (node.type === 'heading') {
      const name = inlineText(node.children).trim() || '(empty heading)';
      const symbol: DocumentSymbol = {
        name,
        detail: `H${node.depth}`,
        kind: 'heading',
        level: node.depth,
        from: node.position.start.offset,
        to: node.position.end.offset,
        selectionFrom: node.position.start.offset,
        selectionTo: node.position.end.offset,
        children: [],
      };
      while (headingStack.length && headingStack[headingStack.length - 1]!.level >= node.depth)
        headingStack.pop();
      // Headings inside components stay inside them.
      while (componentStack.length && componentStack[componentStack.length - 1]!.end < symbol.from)
        componentStack.pop();
      const component = componentStack[componentStack.length - 1];
      const parent = headingStack[headingStack.length - 1];
      if (component && (!parent || component.symbol.from > parent.from))
        component.symbol.children.push(symbol);
      else if (parent) parent.children.push(symbol);
      else roots.push(symbol);
      headingStack.push(symbol);
    } else if (node.type === 'containerDirective') {
      const label = node.label ? inlineText(node.label).trim() : '';
      const symbol: DocumentSymbol = {
        name: label ? `${node.name}: ${label}` : node.name,
        detail: `:::${node.name}`,
        kind: 'component',
        level: 0,
        from: node.position.start.offset,
        to: node.position.end.offset,
        selectionFrom: node.nameRange.start.offset,
        selectionTo: node.nameRange.end.offset,
        children: [],
      };
      attach(symbol);
      componentStack.push({ symbol, end: node.position.end.offset });
    }
  }
  extendHeadingRanges(roots, text.length);
  return roots;
}

/** A heading's range covers its whole section (until the next heading of the same or higher level). */
function extendHeadingRanges(symbols: DocumentSymbol[], end: number): void {
  const headings = symbols.filter((s) => s.kind === 'heading');
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i]!;
    if (s.kind !== 'heading') continue;
    const next = headings.find((h) => h.from > s.from);
    s.to = Math.max(s.to, next ? next.from - 1 : end);
    extendHeadingRanges(s.children, s.to);
  }
}

export interface FoldingRange {
  /** 1-based lines, inclusive. */
  startLine: number;
  endLine: number;
  kind: 'region' | 'comment' | 'imports';
}

export function getFoldingRanges(analysis: Analysis): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  const add = (
    node: Node | { position: Node['position'] },
    kind: FoldingRange['kind'] = 'region',
    endAdjust = 0,
  ) => {
    const startLine = node.position.start.line;
    const endLine = node.position.end.line + endAdjust;
    if (endLine > startLine) ranges.push({ startLine, endLine, kind });
  };
  const fm = analysis.document.frontMatter;
  if (fm) add(fm, 'imports');
  const headings: { line: number; depth: number }[] = [];
  for (const { node } of analysis.nodes()) {
    switch (node.type) {
      case 'containerDirective':
      case 'code':
      case 'blockquote':
      case 'table':
      case 'footnoteDefinition':
        add(node);
        break;
      case 'list':
        add(node);
        break;
      case 'comment':
        add(node, 'comment');
        break;
      case 'heading':
        headings.push({ line: node.position.start.line, depth: node.depth });
        break;
      default:
        break;
    }
  }
  const lastLine = analysis.lineIndex.lineCount;
  headings.forEach((h, i) => {
    const next = headings.slice(i + 1).find((n) => n.depth <= h.depth);
    let end = next ? next.line - 1 : lastLine;
    while (end > h.line && analysis.lineIndex.lineText(end).trim() === '') end--;
    if (end > h.line) ranges.push({ startLine: h.line, endLine: end, kind: 'region' });
  });
  return ranges.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
}
