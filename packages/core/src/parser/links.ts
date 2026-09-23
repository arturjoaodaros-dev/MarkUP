/**
 * Link syntax shared by the inline parser and link reference definitions:
 * labels, destinations and titles.
 */
import { isAsciiPunctuation } from '../syntax/chars.ts';
import { decodeEntities } from '../syntax/entities.ts';

const MAX_LABEL_LENGTH = 999;
const MAX_PAREN_DEPTH = 32;

/** Resolves backslash escapes of ASCII punctuation and character references. */
export function unescapeString(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && isAsciiPunctuation(text[i + 1])) {
      out += text[i + 1];
      i++;
    } else {
      out += c;
    }
  }
  return decodeEntities(out);
}

/** Case-folds and collapses whitespace, so `[Foo  Bar]` matches `[foo bar]`. */
export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();
}

/**
 * A reference label: `[` … `]`, no unescaped brackets inside, at most 999
 * characters, not blank. `pos` points at `[`. Returns the index after `]`.
 */
export function scanLinkLabel(text: string, pos: number): { end: number; label: string } | null {
  if (text[pos] !== '[') return null;
  let i = pos + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (c === '[') return null;
    if (c === ']') {
      const label = text.slice(pos + 1, i);
      if (label.length > MAX_LABEL_LENGTH || label.trim().length === 0) return null;
      return { end: i + 1, label };
    }
    i++;
  }
  return null;
}

/** `<dest>` or a raw destination with balanced parentheses. Returns the unescaped URL. */
export function scanLinkDestination(
  text: string,
  pos: number,
): { end: number; url: string } | null {
  if (text[pos] === '<') {
    let i = pos + 1;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '\\' && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (c === '\n' || c === '<') return null;
      if (c === '>') return { end: i + 1, url: unescapeString(text.slice(pos + 1, i)) };
      i++;
    }
    return null;
  }
  let depth = 0;
  let i = pos;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === 0x5c /* \ */ && isAsciiPunctuation(text[i + 1])) {
      i += 2;
      continue;
    }
    if (c === 0x28 /* ( */) {
      depth++;
      if (depth > MAX_PAREN_DEPTH) return null;
    } else if (c === 0x29 /* ) */) {
      if (depth === 0) break;
      depth--;
    } else if (c <= 0x20 || c === 0x7f) {
      break;
    }
    i++;
  }
  if (i === pos || depth !== 0) return null;
  return { end: i, url: unescapeString(text.slice(pos, i)) };
}

/** `"title"`, `'title'` or `(title)`. */
export function scanLinkTitle(text: string, pos: number): { end: number; title: string } | null {
  const open = text[pos];
  const close = open === '"' ? '"' : open === "'" ? "'" : open === '(' ? ')' : null;
  if (close === null) return null;
  let i = pos + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (c === close) return { end: i + 1, title: unescapeString(text.slice(pos + 1, i)) };
    if (open === '(' && c === '(') return null;
    // A blank line cannot be part of a title.
    if (c === '\n' && /^\n[ \t]*\n/.test(text.slice(i, i + 80))) return null;
    i++;
  }
  return null;
}

/** Skips spaces, tabs and at most one newline. */
export function skipSpaceAndNewline(text: string, pos: number): number {
  let i = pos;
  let newlines = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t') i++;
    else if (c === '\n' && newlines === 0) {
      newlines++;
      i++;
    } else break;
  }
  return i;
}

export interface ParsedDefinition {
  start: number;
  end: number;
  label: string;
  url: string;
  title: string | null;
}

/**
 * Parses one link reference definition at the start of `text` (paragraph
 * content). Returns null when the text does not start with a definition.
 */
export function parseDefinition(text: string, start: number): ParsedDefinition | null {
  let pos = start;
  while (text[pos] === ' ' || text[pos] === '\t') pos++;
  if (text[pos] === '[' && text[pos + 1] === '^') return null; // footnote definition
  const label = scanLinkLabel(text, pos);
  if (!label || text[label.end] !== ':') return null;
  pos = skipSpaceAndNewline(text, label.end + 1);
  const dest = scanLinkDestination(text, pos);
  if (!dest) return null;
  const afterDest = dest.end;
  pos = skipSpaceAndNewline(text, afterDest);
  let title: string | null = null;
  let end = afterDest;
  if (pos > afterDest) {
    const parsed = scanLinkTitle(text, pos);
    if (parsed && isLineEnd(text, parsed.end)) {
      title = parsed.title;
      end = parsed.end;
    }
  }
  if (!isLineEnd(text, end)) return null;
  const lineEnd = text.indexOf('\n', end);
  return {
    start,
    end: lineEnd === -1 ? text.length : lineEnd + 1,
    label: label.label,
    url: dest.url,
    title,
  };
}

function isLineEnd(text: string, pos: number): boolean {
  let i = pos;
  while (text[i] === ' ' || text[i] === '\t') i++;
  return i >= text.length || text[i] === '\n';
}
