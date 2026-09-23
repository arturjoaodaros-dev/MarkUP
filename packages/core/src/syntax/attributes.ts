/**
 * Attribute blocks: `{#id .class key=value key="quoted value" flag}`.
 *
 * A small hand-written lexer/parser. It is used for directives, headings, images
 * and code fence info strings. Items are separated by whitespace (or commas);
 * values may be unquoted (no whitespace, quotes, `,` or braces), double-quoted
 * (with `\"` and `\\` escapes) or single-quoted.
 */
import type { Attribute, Attributes } from '../ast.ts';
import type { DiagnosticBag } from '../diagnostics.ts';
import type { LineIndex } from '../source/position.ts';

export interface AttributeParseResult {
  attributes: Attributes;
  /** Index just past the closing `}` (or the end of the text when unterminated). */
  end: number;
  closed: boolean;
}

export interface AttributeContext {
  index: LineIndex;
  diagnostics: DiagnosticBag | null;
  /** Maps an index in `text` to a source offset. */
  toOffset: (i: number) => number;
}

const KEY_START = /[A-Za-z_]/;
const KEY_CHAR = /[A-Za-z0-9_:.-]/;

/** Parses an attribute block. `text[start]` must be `{`. */
export function parseAttributes(
  text: string,
  start: number,
  ctx: AttributeContext,
  stopAt = text.length,
): AttributeParseResult {
  const items: Attribute[] = [];
  const values: Record<string, string | true> = Object.create(null) as Record<
    string,
    string | true
  >;
  const classes: string[] = [];
  let id: string | null = null;
  const seenKeys = new Map<string, Attribute>();
  let idItem: Attribute | null = null;

  const range = (from: number, to: number) => ctx.index.range(ctx.toOffset(from), ctx.toOffset(to));
  const report = (
    code: 'MU1008' | 'MU1009' | 'MU1010',
    from: number,
    to: number,
    message: string,
    related?: Attribute,
  ) => {
    ctx.diagnostics?.report(code, range(from, Math.max(from, to)), message, {
      related: related ? [{ range: related.range, message: 'Previously set here.' }] : undefined,
    });
  };

  let pos = start + 1;
  let closed = false;
  while (pos < stopAt) {
    const c = text[pos]!;
    if (c === '}') {
      closed = true;
      pos++;
      break;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',') {
      pos++;
      continue;
    }
    const itemStart = pos;
    if (c === '#' || c === '.') {
      pos++;
      const nameStart = pos;
      while (pos < stopAt && isIdentChar(text[pos]!)) pos++;
      const name = text.slice(nameStart, pos);
      if (name.length === 0) {
        report(
          'MU1009',
          itemStart,
          pos + 1,
          c === '#' ? 'Expected an id after `#`.' : 'Expected a class name after `.`.',
        );
        pos = skipJunk(text, pos, stopAt);
        continue;
      }
      const item: Attribute = {
        kind: c === '#' ? 'id' : 'class',
        name: c === '#' ? 'id' : 'class',
        value: name,
        range: range(itemStart, pos),
        nameRange: null,
        valueRange: range(nameStart, pos),
      };
      items.push(item);
      if (item.kind === 'id') {
        if (idItem)
          report(
            'MU1010',
            itemStart,
            pos,
            `The id is set more than once; \`#${name}\` wins.`,
            idItem,
          );
        id = name;
        idItem = item;
      } else {
        classes.push(name);
      }
      continue;
    }
    if (!KEY_START.test(c)) {
      const end = skipJunk(text, pos, stopAt);
      report(
        'MU1009',
        pos,
        end,
        `Unexpected \`${text.slice(pos, end)}\` in attributes. Expected \`#id\`, \`.class\` or \`key=value\`.`,
      );
      pos = end;
      continue;
    }
    const keyStart = pos;
    while (pos < stopAt && KEY_CHAR.test(text[pos]!)) pos++;
    const key = text.slice(keyStart, pos);
    const keyEnd = pos;
    let value: string | true = true;
    let valueRange = null;
    let kind: Attribute['kind'] = 'flag';
    if (text[pos] === '=') {
      pos++;
      const valueStart = pos;
      const q = text[pos];
      if (q === '"' || q === "'") {
        pos++;
        let v = '';
        let terminated = false;
        while (pos < stopAt) {
          const ch = text[pos]!;
          if (ch === '\\' && (text[pos + 1] === q || text[pos + 1] === '\\')) {
            v += text[pos + 1];
            pos += 2;
            continue;
          }
          if (ch === q) {
            terminated = true;
            pos++;
            break;
          }
          v += ch;
          pos++;
        }
        if (!terminated) {
          report('MU1009', valueStart, pos, `Unterminated quoted value for \`${key}\`.`);
        }
        value = v;
      } else {
        while (pos < stopAt && isUnquotedChar(text[pos]!)) pos++;
        value = text.slice(valueStart, pos);
        if (value.length === 0) {
          report('MU1009', keyStart, pos, `Expected a value after \`${key}=\`.`);
        }
      }
      valueRange = range(valueStart, pos);
      kind = 'pair';
    } else if (pos < stopAt && !isSeparator(text[pos]!)) {
      const end = skipJunk(text, pos, stopAt);
      report(
        'MU1009',
        keyStart,
        end,
        `Unexpected \`${text.slice(pos, end)}\` after \`${key}\`. Attribute keys may contain letters, digits, \`_\`, \`-\`, \`:\` and \`.\`.`,
      );
      pos = end;
    }
    const item: Attribute = {
      kind,
      name: key,
      value,
      range: range(itemStart, pos),
      nameRange: range(keyStart, keyEnd),
      valueRange,
    };
    items.push(item);
    const previous = seenKeys.get(key);
    if (previous)
      report(
        'MU1010',
        itemStart,
        pos,
        `Attribute \`${key}\` is set more than once; the last value wins.`,
        previous,
      );
    seenKeys.set(key, item);
    values[key] = value;
  }
  if (!closed) {
    report(
      'MU1008',
      start,
      Math.max(start + 1, Math.min(pos, stopAt)),
      'Unterminated attribute block: expected `}`.',
    );
  }
  return {
    attributes: { id, classes, values, items, range: range(start, pos) },
    end: pos,
    closed,
  };
}

function isSeparator(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',' || c === '}';
}

function isIdentChar(c: string): boolean {
  return !(
    isSeparator(c) ||
    c === '{' ||
    c === '"' ||
    c === "'" ||
    c === '=' ||
    c === '#' ||
    c === '.'
  );
}

function isUnquotedChar(c: string): boolean {
  return !(isSeparator(c) || c === '{' || c === '"' || c === "'" || c === '=' || c === '`');
}

function skipJunk(text: string, pos: number, stopAt: number): number {
  let p = pos;
  while (p < stopAt && !isSeparator(text[p]!)) p++;
  return p === pos ? pos + 1 : p;
}

/**
 * Finds the `}` that closes an attribute block starting at `start`, honouring
 * quoted values. Returns -1 when the block is not closed before `stopAt`.
 */
export function findAttributeBlockEnd(text: string, start: number, stopAt = text.length): number {
  let quote: string | null = null;
  for (let pos = start + 1; pos < stopAt; pos++) {
    const c = text[pos]!;
    if (quote) {
      if (c === '\\' && (text[pos + 1] === quote || text[pos + 1] === '\\')) pos++;
      else if (c === quote) quote = null;
      continue;
    }
    // A quote only opens a string right after `=`.
    if ((c === '"' || c === "'") && text[pos - 1] === '=') quote = c;
    else if (c === '}') return pos;
    else if (c === '{') return -1;
  }
  return -1;
}

/**
 * True when a `{...}` block looks like an attribute block rather than literal text.
 * Used where braces are ambiguous (end of headings, after images): the block must
 * start with `#id`, `.class` or a `key=value` pair.
 */
export function looksLikeAttributes(text: string, start: number): boolean {
  let pos = start + 1;
  while (text[pos] === ' ' || text[pos] === '\t') pos++;
  const c = text[pos];
  if (c === '#' || c === '.') return text[pos + 1] !== undefined && isIdentChar(text[pos + 1]!);
  if (c === undefined || !KEY_START.test(c)) return false;
  while (pos < text.length && KEY_CHAR.test(text[pos]!)) pos++;
  return text[pos] === '=';
}
