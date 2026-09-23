/**
 * Syntax highlighting derived from the real parse tree — so editors color exactly
 * what the parser understood (an unclosed fence, an unknown component…).
 */
import { isDirective, type Attributes, type DataNode, type Node } from '@markup-lang/core';
import type { Analysis } from './analysis.ts';

export type HighlightKind =
  | 'heading'
  | 'headingMarker'
  | 'emphasis'
  | 'strong'
  | 'strikethrough'
  | 'code'
  | 'codeFence'
  | 'codeInfo'
  | 'codeBlock'
  | 'link'
  | 'url'
  | 'image'
  | 'marker'
  | 'hr'
  | 'comment'
  | 'directiveFence'
  | 'directiveName'
  | 'directiveUnknown'
  | 'directiveLabel'
  | 'attributeKey'
  | 'attributeValue'
  | 'attributeId'
  | 'attributeClass'
  | 'punctuation'
  | 'dataKey'
  | 'dataString'
  | 'dataNumber'
  | 'dataLiteral'
  | 'frontMatter'
  | 'footnote'
  | 'tableDelimiter';

export interface Highlight {
  from: number;
  to: number;
  kind: HighlightKind;
}

export function getHighlights(analysis: Analysis): Highlight[] {
  const text = analysis.text;
  const out: Highlight[] = [];
  const add = (from: number, to: number, kind: HighlightKind) => {
    if (to > from) out.push({ from, to, kind });
  };
  const fm = analysis.document.frontMatter;
  if (fm) {
    add(fm.position.start.offset, fm.position.end.offset, 'frontMatter');
    const firstEnd = text.indexOf('\n', fm.position.start.offset);
    add(fm.position.start.offset, firstEnd === -1 ? fm.position.end.offset : firstEnd, 'punctuation');
    if (fm.value) data(fm.value, add);
  }

  for (const { node } of analysis.nodes()) {
    const { start, end } = node.position;
    const s = start.offset;
    const e = end.offset;
    switch (node.type) {
      case 'heading': {
        add(s, e, 'heading');
        if (node.style === 'atx') {
          let m = s;
          while (text[m] === '#') m++;
          add(s, m, 'headingMarker');
        } else {
          const underline = text.lastIndexOf('\n', e - 1);
          add(underline + 1, e, 'headingMarker');
        }
        if (node.attributes) attributes(node.attributes, add);
        break;
      }
      case 'emphasis':
        add(s, e, 'emphasis');
        add(s, s + 1, 'marker');
        add(e - 1, e, 'marker');
        break;
      case 'strong':
        add(s, e, 'strong');
        add(s, s + 2, 'marker');
        add(e - 2, e, 'marker');
        break;
      case 'delete':
        add(s, e, 'strikethrough');
        break;
      case 'inlineCode':
        add(s, e, 'code');
        break;
      case 'link':
      case 'image': {
        if (node.type === 'link' && node.kind !== 'inline' && node.kind !== 'reference') {
          add(s, e, 'url');
          break;
        }
        const close = text.lastIndexOf('](', e);
        if (close > s && close < e) {
          add(s, close + 1, node.type === 'image' ? 'image' : 'link');
          add(close + 1, e, 'url');
        } else {
          add(s, e, node.type === 'image' ? 'image' : 'link');
        }
        if (node.type === 'image' && node.attributes) attributes(node.attributes, add);
        break;
      }
      case 'footnoteReference':
        add(s, e, 'footnote');
        break;
      case 'footnoteDefinition': {
        const label = text.indexOf(']:', s);
        if (label !== -1) add(s, label + 2, 'footnote');
        break;
      }
      case 'definition': {
        add(s, e, 'url');
        const colon = text.indexOf(']:', s);
        if (colon !== -1 && colon < e) add(s, colon + 2, 'link');
        break;
      }
      case 'code': {
        add(s, e, 'codeBlock');
        const firstEnd = lineEnd(text, s);
        let fence = s;
        while (text[fence] === '`' || text[fence] === '~') fence++;
        add(s, fence, 'codeFence');
        add(fence, firstEnd, 'codeInfo');
        if (node.attributes) attributes(node.attributes, add);
        if (node.closed) add(lineStart(text, e), e, 'codeFence');
        break;
      }
      case 'thematicBreak':
        add(s, e, 'hr');
        break;
      case 'comment':
        add(s, e, 'comment');
        break;
      case 'blockquote':
      case 'listItem':
        markers(text, node, add);
        break;
      case 'table': {
        const header = lineEnd(text, s);
        const delimiter = lineEnd(text, header + 1);
        add(header + 1, delimiter, 'tableDelimiter');
        break;
      }
      default:
        break;
    }
    if (isDirective(node)) directive(node, analysis, add);
  }
  out.sort((a, b) => a.from - b.from || b.to - a.to);
  return out;
}

type Add = (from: number, to: number, kind: HighlightKind) => void;

function directive(node: Extract<Node, { name: string }>, analysis: Analysis, add: Add): void {
  const known = analysis.registry.has(node.name);
  const s = node.position.start.offset;
  add(s, node.nameRange.start.offset, 'directiveFence');
  add(node.nameRange.start.offset, node.nameRange.end.offset, known ? 'directiveName' : 'directiveUnknown');
  if (node.labelRange) {
    add(node.labelRange.start.offset, node.labelRange.start.offset + 1, 'punctuation');
    add(node.labelRange.start.offset + 1, node.labelRange.end.offset - 1, 'directiveLabel');
    add(node.labelRange.end.offset - 1, node.labelRange.end.offset, 'punctuation');
  }
  if (node.attributes) attributes(node.attributes, add);
  if (node.type === 'containerDirective') {
    if (node.closeRange) add(node.closeRange.start.offset, node.closeRange.end.offset, 'directiveFence');
    if (node.body.kind === 'data' && node.body.value) data(node.body.value, add);
  }
}

function attributes(attrs: Attributes, add: Add): void {
  add(attrs.range.start.offset, attrs.range.start.offset + 1, 'punctuation');
  add(attrs.range.end.offset - 1, attrs.range.end.offset, 'punctuation');
  for (const item of attrs.items) {
    if (item.kind === 'id') add(item.range.start.offset, item.range.end.offset, 'attributeId');
    else if (item.kind === 'class') add(item.range.start.offset, item.range.end.offset, 'attributeClass');
    else {
      if (item.nameRange) add(item.nameRange.start.offset, item.nameRange.end.offset, 'attributeKey');
      if (item.valueRange) add(item.valueRange.start.offset, item.valueRange.end.offset, 'attributeValue');
    }
  }
}

function data(node: DataNode, add: Add): void {
  const stack: DataNode[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.kind === 'map') {
      for (const entry of n.entries) {
        add(entry.keyRange.start.offset, entry.keyRange.end.offset, 'dataKey');
        stack.push(entry.value);
      }
    } else if (n.kind === 'seq') {
      stack.push(...n.items);
    } else if (n.range.end.offset > n.range.start.offset) {
      const kind = typeof n.value === 'number' ? 'dataNumber' : typeof n.value === 'string' ? 'dataString' : 'dataLiteral';
      add(n.range.start.offset, n.range.end.offset, kind);
    }
  }
}

/** `>` markers of blockquotes and list item markers. */
function markers(text: string, node: Node, add: Add): void {
  const s = node.position.start.offset;
  if (node.type === 'listItem') {
    add(s, s + node.marker.length, 'marker');
    const task = /^[ \t]+\[[ xX]\]/.exec(text.slice(s + node.marker.length, s + node.marker.length + 8));
    if (node.checked !== null && task) add(s + node.marker.length, s + node.marker.length + task[0].length, 'marker');
    return;
  }
  // Every line of the quote: the first `>` at or after the quote's column.
  let lineFrom = s;
  const end = node.position.end.offset;
  const column = node.position.start.column - 1;
  while (lineFrom <= end) {
    const ls = lineStart(text, lineFrom);
    const le = lineEnd(text, lineFrom);
    const at = ls + column;
    if (text[at] === '>') add(at, at + 1, 'marker');
    if (le >= end) break;
    lineFrom = le + (text[le] === '\r' && text[le + 1] === '\n' ? 2 : 1);
  }
}

function lineEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
  return i;
}

function lineStart(text: string, from: number): number {
  let i = from;
  while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--;
  return i;
}

// ---------------------------------------------------------------------------
// LSP semantic tokens: a non-overlapping, single-line subset.

export const SEMANTIC_TOKEN_TYPES = ['keyword', 'class', 'property', 'string', 'number', 'variable', 'comment'] as const;
export const SEMANTIC_TOKEN_MODIFIERS = ['defaultLibrary', 'deprecated'] as const;

export interface SemanticToken {
  line: number; // 0-based
  character: number; // 0-based, UTF-16
  length: number;
  type: number;
  modifiers: number;
}

const SEMANTIC_MAP: Partial<Record<HighlightKind, [number, number]>> = {
  directiveFence: [0, 0],
  directiveName: [1, 1],
  directiveUnknown: [1, 2],
  attributeKey: [2, 0],
  attributeValue: [3, 0],
  attributeId: [5, 0],
  attributeClass: [5, 0],
  dataKey: [2, 0],
  dataString: [3, 0],
  dataNumber: [4, 0],
  dataLiteral: [0, 0],
};

export function getSemanticTokens(analysis: Analysis): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  let lastEnd = -1;
  for (const h of getHighlights(analysis)) {
    const mapped = SEMANTIC_MAP[h.kind];
    if (!mapped || h.from < lastEnd) continue;
    // Split at line breaks: LSP tokens cannot span lines.
    let from = h.from;
    while (from < h.to) {
      const to = Math.min(h.to, lineEnd(analysis.text, from));
      if (to > from) {
        const p = analysis.lineIndex.pointAt(from);
        tokens.push({ line: p.line - 1, character: p.column - 1, length: to - from, type: mapped[0], modifiers: mapped[1] });
      }
      from = to + (analysis.text[to] === '\r' && analysis.text[to + 1] === '\n' ? 2 : 1);
    }
    lastEnd = h.to;
  }
  return tokens;
}

/** LSP's relative encoding of semantic tokens. */
export function encodeSemanticTokens(tokens: readonly SemanticToken[]): number[] {
  const data: number[] = [];
  let line = 0;
  let character = 0;
  for (const t of tokens) {
    const deltaLine = t.line - line;
    data.push(deltaLine, deltaLine === 0 ? t.character - character : t.character, t.length, t.type, t.modifiers);
    line = t.line;
    character = t.character;
  }
  return data;
}
