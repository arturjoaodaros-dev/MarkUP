/**
 * MarkUP Data parser.
 *
 * A strict, positioned subset of YAML:
 *
 * - block mappings (`key: value`) and block sequences (`- item`), nested by indentation
 * - compact sequences under a key (`key:` followed by `- item` at the same indent)
 * - flow sequences on one line: `[1, 2, "three", [4]]`
 * - scalars: plain, "double quoted" (with escapes), 'single quoted', `|` / `|-` literal blocks
 * - plain scalars resolve to null (`null`, `~`), booleans (`true`/`false`) and numbers;
 *   everything else is a string (numbers with leading zeros stay strings)
 * - `#` comments on their own line or after whitespace
 *
 * Not supported (reported as errors): tabs in indentation, flow mappings `{}`,
 * folded scalars `>`. Anchors, aliases and tags have no meaning and are read as
 * plain text.
 *
 * The parser never throws. Malformed input produces diagnostics and a best-effort tree.
 */
import type { DiagnosticBag } from '../diagnostics.ts';
import type { LineIndex } from '../source/position.ts';
import type { DataMap, DataMapEntry, DataNode, DataScalar, DataSeq } from './types.ts';

/** One line of data source: its text and the source offset of its first character. */
export interface DataLine {
  text: string;
  offset: number;
}

const MAX_DEPTH = 128;

interface Line {
  raw: string;
  offset: number;
  /** Current indentation; the sequence parser may raise it to re-read the rest of a line. */
  indent: number;
  /** Blank or comment-only. */
  skip: boolean;
}

export function parseData(
  input: readonly DataLine[],
  index: LineIndex,
  diagnostics: DiagnosticBag,
): DataNode | null {
  return new DataParser(input, index, diagnostics).parseDocument();
}

class DataParser {
  private readonly lines: Line[];
  private readonly index: LineIndex;
  private readonly diagnostics: DiagnosticBag;
  private i = 0;
  private depth = 0;

  constructor(input: readonly DataLine[], index: LineIndex, diagnostics: DiagnosticBag) {
    this.index = index;
    this.diagnostics = diagnostics;
    this.lines = input.map((line) => this.prepare(line));
  }

  private prepare(line: DataLine): Line {
    let indent = 0;
    let raw = line.text;
    while (indent < raw.length) {
      const c = raw.charCodeAt(indent);
      if (c === 0x20) {
        indent++;
      } else if (c === 0x09) {
        this.error(
          'MU1503',
          line.offset + indent,
          line.offset + indent + 1,
          'Tabs are not allowed in MarkUP Data indentation; use spaces.',
        );
        // Recover by reading the tab as one space so that the rest of the line keeps its offsets.
        raw = raw.slice(0, indent) + ' ' + raw.slice(indent + 1);
        indent++;
      } else {
        break;
      }
    }
    const rest = raw.slice(indent);
    const skip = rest.length === 0 || rest.charCodeAt(0) === 0x23; /* # */
    return { raw, offset: line.offset, indent, skip };
  }

  parseDocument(): DataNode | null {
    this.skipBlank();
    if (this.i >= this.lines.length) return null;
    const first = this.lines[this.i]!;
    const node = this.parseNode(first.indent);
    this.skipBlank();
    if (this.i < this.lines.length) {
      const line = this.lines[this.i]!;
      this.error(
        'MU1501',
        line.offset + line.indent,
        line.offset + line.raw.trimEnd().length,
        'Unexpected content after the end of the data.',
      );
    }
    return node;
  }

  // -------------------------------------------------------------------------
  // Blocks

  private parseNode(indent: number): DataNode {
    const line = this.lines[this.i]!;
    if (this.depth >= MAX_DEPTH) {
      this.error(
        'MU1501',
        line.offset,
        line.offset + line.raw.length,
        `Data is nested more than ${MAX_DEPTH} levels deep.`,
      );
      this.skipDeeperThan(indent - 1);
      return this.scalar(null, 'plain', line.offset + line.indent, line.offset + line.indent);
    }
    this.depth++;
    try {
      const content = line.raw.slice(line.indent);
      if (isSeqItem(content)) return this.parseSeq(indent);
      if (findKeyEnd(content) !== null) return this.parseMap(indent);
      const node = this.parseInlineValue(line, line.indent, indent);
      return node;
    } finally {
      this.depth--;
    }
  }

  private parseMap(indent: number): DataMap {
    const entries: DataMapEntry[] = [];
    const seen = new Map<string, DataMapEntry>();
    const startLine = this.lines[this.i]!;
    const start = startLine.offset + startLine.indent;
    let end = start;
    while (true) {
      this.skipBlank();
      const line = this.lines[this.i];
      if (!line || line.indent < indent) break;
      const content = line.raw.slice(line.indent);
      if (line.indent > indent) {
        this.error(
          'MU1501',
          line.offset + line.indent,
          line.offset + line.raw.trimEnd().length,
          'Unexpected indentation.',
        );
        this.i++;
        continue;
      }
      const keyEnd = findKeyEnd(content);
      if (keyEnd === null) {
        if (isSeqItem(content)) break; // Belongs to an enclosing compact sequence.
        this.error(
          'MU1501',
          line.offset + line.indent,
          line.offset + line.raw.trimEnd().length,
          'Expected a `key: value` entry.',
        );
        this.i++;
        continue;
      }
      const keyStart = line.offset + line.indent;
      const key = readKey(content.slice(0, keyEnd.colon));
      if (key.error)
        this.error(key.error.code, keyStart, keyStart + keyEnd.colon, key.error.message);
      const keyRange = this.index.range(keyStart, keyStart + keyEnd.keyLength);
      const afterColon = line.indent + keyEnd.colon + 1;
      const value = this.parseEntryValue(line, afterColon, indent);
      const entry: DataMapEntry = {
        key: key.value,
        keyRange,
        value,
        range: this.index.range(
          keyStart,
          Math.max(value.range.end.offset, keyRange.end.offset + 1),
        ),
      };
      end = entry.range.end.offset;
      const previous = seen.get(key.value);
      if (previous) {
        this.diagnostics.report(
          'MU1502',
          keyRange,
          `Duplicate key \`${key.value}\`; this entry is ignored.`,
          {
            related: [{ range: previous.keyRange, message: 'First defined here.' }],
          },
        );
      } else {
        seen.set(key.value, entry);
        entries.push(entry);
      }
    }
    return { kind: 'map', entries, range: this.index.range(start, end) };
  }

  /** Parses what follows `key:` — inline, literal block or nested block. `this.i` points at the key line. */
  private parseEntryValue(line: Line, column: number, parentIndent: number): DataNode {
    const rest = line.raw.slice(column);
    const trimmed = rest.trimStart();
    const valueColumn = column + (rest.length - trimmed.length);
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      this.i++;
      return this.parseNestedValue(parentIndent, line.offset + column);
    }
    if (trimmed.startsWith('|')) return this.parseLiteral(line, valueColumn, parentIndent);
    return this.parseInlineValue(line, valueColumn, parentIndent);
  }

  /** A value that lives on the following lines, or null when there is none. */
  private parseNestedValue(parentIndent: number, emptyAt: number): DataNode {
    this.skipBlank();
    const next = this.lines[this.i];
    if (next) {
      const content = next.raw.slice(next.indent);
      if (next.indent > parentIndent) return this.parseNode(next.indent);
      if (next.indent === parentIndent && isSeqItem(content)) return this.parseSeq(parentIndent);
    }
    return this.scalar(null, 'plain', emptyAt, emptyAt);
  }

  private parseSeq(indent: number): DataSeq {
    const items: DataNode[] = [];
    const startLine = this.lines[this.i]!;
    const start = startLine.offset + startLine.indent;
    let end = start + 1;
    while (true) {
      this.skipBlank();
      const line = this.lines[this.i];
      if (!line || line.indent < indent) break;
      const content = line.raw.slice(line.indent);
      if (line.indent > indent) {
        this.error(
          'MU1501',
          line.offset + line.indent,
          line.offset + line.raw.trimEnd().length,
          'Unexpected indentation.',
        );
        this.i++;
        continue;
      }
      if (!isSeqItem(content)) break;
      const dash = line.indent;
      let column = dash + 1;
      while (line.raw.charCodeAt(column) === 0x20) column++;
      const rest = line.raw.slice(column);
      let item: DataNode;
      if (rest.length === 0 || rest.startsWith('#')) {
        this.i++;
        item = this.parseNestedValue(indent, line.offset + dash + 1);
      } else if (isSeqItem(rest) || findKeyEnd(rest) !== null) {
        // `- - x` or `- key: value`: re-read the rest of the line as a nested block at its column.
        line.indent = column;
        item = this.parseNode(column);
      } else if (rest.startsWith('|')) {
        item = this.parseLiteral(line, column, indent);
      } else {
        item = this.parseInlineValue(line, column, indent);
      }
      items.push(item);
      end = Math.max(end, item.range.end.offset);
    }
    return { kind: 'seq', items, flow: false, range: this.index.range(start, end) };
  }

  /** `|` or `|-` followed by more-indented lines. `this.i` points at the indicator line. */
  private parseLiteral(line: Line, column: number, parentIndent: number): DataScalar {
    const indicator = line.raw.slice(column).trimEnd();
    const header = /^\|([-+]?)\s*(#.*)?$/.exec(indicator);
    const indicatorStart = line.offset + column;
    if (!header) {
      this.error(
        'MU1501',
        indicatorStart,
        line.offset + line.raw.trimEnd().length,
        'A literal block starts with `|` or `|-` followed by the end of the line.',
      );
    }
    const chomp = header?.[1] ?? '';
    this.i++;
    const collected: string[] = [];
    let blockIndent = -1;
    let end = indicatorStart + 1;
    while (this.i < this.lines.length) {
      const next = this.lines[this.i]!;
      const blank = next.raw.trim().length === 0;
      if (!blank) {
        if (next.indent <= parentIndent) break;
        if (blockIndent === -1) blockIndent = next.indent;
        if (next.indent < blockIndent) break;
      }
      collected.push(blank ? '' : next.raw.slice(blockIndent));
      if (!blank) end = next.offset + next.raw.length;
      this.i++;
    }
    // Trailing blank lines are not content.
    while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop();
    let value = collected.join('\n');
    if (chomp === '+' || (chomp === '' && collected.length > 0)) value += '\n';
    return this.scalar(value, 'literal', indicatorStart, end);
  }

  // -------------------------------------------------------------------------
  // Inline values (single line)

  private parseInlineValue(line: Line, column: number, _parentIndent: number): DataNode {
    this.i++;
    const text = line.raw;
    const cursor = { pos: column };
    const node = this.readValue(text, line.offset, cursor, false, 0);
    this.expectLineEnd(text, line.offset, cursor.pos);
    return node;
  }

  /** Reads one value starting at `cursor.pos`. In flow context, plain scalars stop at `,` and `]`. */
  private readValue(
    text: string,
    offset: number,
    cursor: { pos: number },
    flow: boolean,
    depth: number,
  ): DataNode {
    const c = text.charCodeAt(cursor.pos);
    if (c === 0x22 /* " */) return this.readDoubleQuoted(text, offset, cursor);
    if (c === 0x27 /* ' */) return this.readSingleQuoted(text, offset, cursor);
    if (c === 0x5b /* [ */) return this.readFlowSeq(text, offset, cursor, depth);
    if (c === 0x7b /* { */) {
      const start = cursor.pos;
      const close = text.indexOf('}', start);
      const stop = close === -1 ? text.length : close + 1;
      this.error(
        'MU1501',
        offset + start,
        offset + stop,
        'Flow mappings `{...}` are not supported in MarkUP Data; use an indented block mapping.',
      );
      cursor.pos = stop;
      return this.scalar(text.slice(start, stop), 'plain', offset + start, offset + stop);
    }
    if (!flow && c === 0x3e /* > */ && /^>[-+]?\s*(#.*)?$/.test(text.slice(cursor.pos).trimEnd())) {
      const start = cursor.pos;
      this.error(
        'MU1501',
        offset + start,
        offset + start + 1,
        'Folded block scalars (`>`) are not supported; use a `|` literal block.',
      );
      cursor.pos = text.length;
      this.skipDeeperThan(this.lines[this.i - 1]?.indent ?? 0);
      return this.scalar('', 'plain', offset + start, offset + start + 1);
    }
    return this.readPlain(text, offset, cursor, flow);
  }

  private readPlain(
    text: string,
    offset: number,
    cursor: { pos: number },
    flow: boolean,
  ): DataScalar {
    const start = cursor.pos;
    let pos = start;
    while (pos < text.length) {
      const c = text.charCodeAt(pos);
      if (c === 0x23 /* # */ && pos > start && isSpace(text.charCodeAt(pos - 1))) break;
      if (flow && (c === 0x2c /* , */ || c === 0x5d) /* ] */) break;
      pos++;
    }
    cursor.pos = pos;
    let endTrim = pos;
    while (endTrim > start && isSpace(text.charCodeAt(endTrim - 1))) endTrim--;
    const raw = text.slice(start, endTrim);
    return this.scalar(resolvePlain(raw), 'plain', offset + start, offset + endTrim);
  }

  private readDoubleQuoted(text: string, offset: number, cursor: { pos: number }): DataScalar {
    const start = cursor.pos;
    let pos = start + 1;
    let value = '';
    while (pos < text.length) {
      const c = text[pos]!;
      if (c === '"') {
        cursor.pos = pos + 1;
        return this.scalar(value, 'double', offset + start, offset + pos + 1);
      }
      if (c === '\\') {
        const next = text[pos + 1];
        const escaped = next === undefined ? undefined : DOUBLE_ESCAPES[next];
        if (escaped !== undefined) {
          value += escaped;
          pos += 2;
          continue;
        }
        if (next === 'u' || next === 'x') {
          const digits = next === 'u' ? 4 : 2;
          const hex = text.slice(pos + 2, pos + 2 + digits);
          if (hex.length === digits && /^[0-9a-fA-F]+$/.test(hex)) {
            value += String.fromCharCode(parseInt(hex, 16));
            pos += 2 + digits;
            continue;
          }
        }
        this.error(
          'MU1501',
          offset + pos,
          offset + Math.min(pos + 2, text.length),
          `Unknown escape sequence \`\\${next ?? ''}\`.`,
        );
        value += next ?? '';
        pos += 2;
        continue;
      }
      value += c;
      pos++;
    }
    cursor.pos = text.length;
    this.error(
      'MU1504',
      offset + start,
      offset + text.length,
      'Unterminated double-quoted string.',
    );
    return this.scalar(value, 'double', offset + start, offset + text.length);
  }

  private readSingleQuoted(text: string, offset: number, cursor: { pos: number }): DataScalar {
    const start = cursor.pos;
    let pos = start + 1;
    let value = '';
    while (pos < text.length) {
      const c = text[pos]!;
      if (c === "'") {
        if (text[pos + 1] === "'") {
          value += "'";
          pos += 2;
          continue;
        }
        cursor.pos = pos + 1;
        return this.scalar(value, 'single', offset + start, offset + pos + 1);
      }
      value += c;
      pos++;
    }
    cursor.pos = text.length;
    this.error(
      'MU1504',
      offset + start,
      offset + text.length,
      'Unterminated single-quoted string.',
    );
    return this.scalar(value, 'single', offset + start, offset + text.length);
  }

  private readFlowSeq(
    text: string,
    offset: number,
    cursor: { pos: number },
    depth: number,
  ): DataSeq {
    const start = cursor.pos;
    const items: DataNode[] = [];
    if (depth >= MAX_DEPTH) {
      this.error(
        'MU1501',
        offset + start,
        offset + text.length,
        `Flow sequences are nested more than ${MAX_DEPTH} levels deep.`,
      );
      cursor.pos = text.length;
      return {
        kind: 'seq',
        items,
        flow: true,
        range: this.index.range(offset + start, offset + text.length),
      };
    }
    let pos = start + 1;
    let expectItem = true;
    while (true) {
      while (isSpace(text.charCodeAt(pos))) pos++;
      if (pos >= text.length) {
        this.error(
          'MU1501',
          offset + start,
          offset + text.length,
          'Unterminated flow sequence: expected `]`.',
        );
        cursor.pos = text.length;
        return {
          kind: 'seq',
          items,
          flow: true,
          range: this.index.range(offset + start, offset + text.length),
        };
      }
      const c = text.charCodeAt(pos);
      if (c === 0x5d /* ] */) {
        cursor.pos = pos + 1;
        return {
          kind: 'seq',
          items,
          flow: true,
          range: this.index.range(offset + start, offset + pos + 1),
        };
      }
      if (c === 0x2c /* , */) {
        if (expectItem)
          this.error('MU1501', offset + pos, offset + pos + 1, 'Expected a value before `,`.');
        expectItem = true;
        pos++;
        continue;
      }
      if (!expectItem) {
        this.error('MU1501', offset + pos, offset + pos + 1, 'Expected `,` or `]`.');
      }
      if (c === 0x23 /* # */ && isSpace(text.charCodeAt(pos - 1))) {
        this.error(
          'MU1501',
          offset + start,
          offset + text.length,
          'Unterminated flow sequence: expected `]` before the comment.',
        );
        cursor.pos = text.length;
        return {
          kind: 'seq',
          items,
          flow: true,
          range: this.index.range(offset + start, offset + pos),
        };
      }
      const itemCursor = { pos };
      const item = this.readValue(text, offset, itemCursor, true, depth + 1);
      if (itemCursor.pos === pos) {
        // Defensive: never loop without consuming input.
        itemCursor.pos = pos + 1;
      }
      items.push(item);
      pos = itemCursor.pos;
      expectItem = false;
    }
  }

  private expectLineEnd(text: string, offset: number, pos: number): void {
    let p = pos;
    while (isSpace(text.charCodeAt(p))) p++;
    if (p >= text.length) return;
    if (
      text.charCodeAt(p) === 0x23 &&
      (p === pos ? p === 0 || isSpace(text.charCodeAt(p - 1)) : true)
    )
      return;
    this.error(
      'MU1501',
      offset + p,
      offset + text.trimEnd().length,
      'Unexpected characters after the value.',
    );
  }

  // -------------------------------------------------------------------------
  // Helpers

  private skipBlank(): void {
    while (this.i < this.lines.length && this.lines[this.i]!.skip) this.i++;
  }

  /** Skips every following line indented more than `indent` (error recovery). */
  private skipDeeperThan(indent: number): void {
    while (this.i < this.lines.length) {
      const line = this.lines[this.i]!;
      if (!line.skip && line.indent <= indent) break;
      this.i++;
    }
  }

  private scalar(
    value: DataScalar['value'],
    style: DataScalar['style'],
    start: number,
    end: number,
  ): DataScalar {
    return { kind: 'scalar', value, style, range: this.index.range(start, end) };
  }

  private error(
    code: 'MU1501' | 'MU1503' | 'MU1504',
    start: number,
    end: number,
    message: string,
  ): void {
    this.diagnostics.report(code, this.index.range(start, Math.max(start, end)), message);
  }
}

const DOUBLE_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  n: '\n',
  t: '\t',
  r: '\r',
  '0': '\0',
  b: '\b',
  f: '\f',
};

function isSpace(c: number): boolean {
  return c === 0x20 || c === 0x09;
}

function isSeqItem(content: string): boolean {
  return content === '-' || content.startsWith('- ') || content.startsWith('-\t');
}

/**
 * If `content` starts with a mapping key, returns the index of its colon and the
 * key's length. A key is a quoted string or plain text, followed by `:` and then
 * whitespace or the end of the line.
 */
function findKeyEnd(content: string): { colon: number; keyLength: number } | null {
  const first = content.charCodeAt(0);
  if (first === 0x22 || first === 0x27) {
    const quote = content[0]!;
    let pos = 1;
    while (pos < content.length) {
      const c = content[pos]!;
      if (quote === '"' && c === '\\') {
        pos += 2;
        continue;
      }
      if (c === quote) {
        if (quote === "'" && content[pos + 1] === "'") {
          pos += 2;
          continue;
        }
        break;
      }
      pos++;
    }
    if (pos >= content.length) return null;
    const keyLength = pos + 1;
    let colon = keyLength;
    while (isSpace(content.charCodeAt(colon))) colon++;
    if (content.charCodeAt(colon) !== 0x3a) return null;
    if (colon + 1 < content.length && !isSpace(content.charCodeAt(colon + 1))) return null;
    return { colon, keyLength };
  }
  if (
    first === 0x5b /* [ */ ||
    first === 0x7b /* { */ ||
    first === 0x23 /* # */ ||
    first === 0x7c /* | */ ||
    first === 0x3e /* > */
  ) {
    return null;
  }
  if (isSeqItem(content)) return null;
  for (let pos = 0; pos < content.length; pos++) {
    const c = content.charCodeAt(pos);
    if (c === 0x23 && pos > 0 && isSpace(content.charCodeAt(pos - 1))) return null;
    if (
      c === 0x3a /* : */ &&
      (pos + 1 === content.length || isSpace(content.charCodeAt(pos + 1)))
    ) {
      if (pos === 0) return null;
      let keyLength = pos;
      while (keyLength > 0 && isSpace(content.charCodeAt(keyLength - 1))) keyLength--;
      return { colon: pos, keyLength };
    }
  }
  return null;
}

function readKey(source: string): { value: string; error?: { code: 'MU1501'; message: string } } {
  const trimmed = source.trim();
  if (trimmed.startsWith('"')) {
    try {
      return { value: JSON.parse(trimmed) as string };
    } catch {
      return {
        value: trimmed.slice(1, -1),
        error: { code: 'MU1501', message: 'Invalid escape in quoted key.' },
      };
    }
  }
  if (trimmed.startsWith("'")) return { value: trimmed.slice(1, -1).replace(/''/g, "'") };
  return { value: trimmed };
}

const NUMBER = /^[-+]?(?:(?:0|[1-9][0-9_]*)(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/;

/** Resolves a plain scalar to null, boolean, number or string. */
export function resolvePlain(raw: string): string | number | boolean | null {
  if (raw === '' || raw === '~' || raw === 'null' || raw === 'Null' || raw === 'NULL') return null;
  const lower = raw.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (NUMBER.test(raw)) {
    const value = Number(raw.replace(/_/g, ''));
    if (Number.isFinite(value)) return value;
  }
  return raw;
}
