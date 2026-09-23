/**
 * Inline parser.
 *
 * A single left-to-right scan over the inline text of a block. Scanning and
 * tokenising are fused because inline tokens are context dependent (code spans
 * win over everything; link destinations are raw text; `*` only means emphasis
 * depending on what surrounds it). Emphasis, strong and strikethrough are
 * resolved afterwards with the CommonMark delimiter-stack algorithm; links and
 * images with the bracket stack.
 *
 * Nodes live in a doubly linked list while parsing so that wrapping a run of
 * nodes into an emphasis or link is O(1).
 */
import type {
  Attributes,
  Break,
  Comment,
  Definition,
  Emphasis,
  FootnoteReference,
  Image,
  Inline,
  InlineCode,
  InlineDirective,
  Link,
  Strong,
  Delete,
  Text,
} from '../ast.ts';
import type { DiagnosticBag } from '../diagnostics.ts';
import type { DirectiveRegistry } from '../directives/spec.ts';
import type { LineIndex, Range } from '../source/position.ts';
import { findAttributeBlockEnd, looksLikeAttributes, parseAttributes } from '../syntax/attributes.ts';
import {
  charAt,
  charBefore,
  isAlphanumeric,
  isAsciiPunctuation,
  isUnicodePunctuation,
  isUnicodeWhitespace,
  readName,
} from '../syntax/chars.ts';
import { matchEntity } from '../syntax/entities.ts';
import {
  normalizeLabel,
  scanLinkDestination,
  scanLinkLabel,
  scanLinkTitle,
  skipSpaceAndNewline,
} from './links.ts';
import type { SegmentText } from './segments.ts';

/** Maximum nesting of inline directive labels and of emphasis/links. */
export const MAX_INLINE_DEPTH = 32;

export interface InlineContext {
  index: LineIndex;
  diagnostics: DiagnosticBag;
  registry: DirectiveRegistry;
  definitions: ReadonlyMap<string, Definition>;
}

interface LNode {
  node: Inline;
  /** Start and end indices into the joined text. */
  s: number;
  e: number;
  prev: LNode | null;
  next: LNode | null;
}

interface Delimiter {
  lnode: LNode;
  char: '*' | '_' | '~';
  count: number;
  origCount: number;
  canOpen: boolean;
  canClose: boolean;
  prev: Delimiter | null;
  next: Delimiter | null;
}

interface Bracket {
  lnode: LNode;
  image: boolean;
  active: boolean;
  /** Index just after `[`. */
  contentStart: number;
  prevDelimiter: Delimiter | null;
  prev: Bracket | null;
  bracketAfter: boolean;
}

export function parseInlines(
  source: SegmentText,
  ctx: InlineContext,
  options: { tableCell?: boolean; start?: number; end?: number; depth?: number } = {},
): Inline[] {
  return new InlineParser(source, ctx, options.start ?? 0, options.end ?? source.text.length, options.tableCell ?? false, options.depth ?? 0).parse();
}

const SPECIAL = /[\n\\`*_~[\]!<&:hHwW]/g;

class InlineParser {
  private readonly src: SegmentText;
  private readonly text: string;
  private readonly ctx: InlineContext;
  private readonly end: number;
  private readonly tableCell: boolean;
  private readonly depth: number;
  private pos: number;
  private head: LNode | null = null;
  private tail: LNode | null = null;
  private delimiters: Delimiter | null = null;
  private brackets: Bracket | null = null;
  /** Code span backtick runs known to have no closer at or after a position. */
  private readonly backtickNoClose = new Map<number, number>();

  constructor(src: SegmentText, ctx: InlineContext, start: number, end: number, tableCell: boolean, depth: number) {
    this.src = src;
    this.text = src.text;
    this.ctx = ctx;
    this.pos = start;
    this.end = end;
    this.tableCell = tableCell;
    this.depth = depth;
  }

  parse(): Inline[] {
    while (this.pos < this.end) {
      if (!this.step()) this.consumeText();
    }
    this.processEmphasis(null);
    return finalizeList(this.head, this);
  }

  /** Handles a special character at `pos`. Returns false when it is plain text. */
  private step(): boolean {
    const c = this.text[this.pos]!;
    switch (c) {
      case '\n':
        this.handleNewline();
        return true;
      case '\\':
        this.handleBackslash();
        return true;
      case '`':
        this.handleBackticks();
        return true;
      case '*':
      case '_':
        this.handleDelimiters(c);
        return true;
      case '~':
        return this.handleTilde();
      case '[':
        return this.handleOpenBracket();
      case '!':
        if (this.text[this.pos + 1] === '[') {
          const lnode = this.appendText('![', this.pos, this.pos + 2);
          this.pushBracket(lnode, true, this.pos + 2);
          this.pos += 2;
          return true;
        }
        return false;
      case ']':
        this.handleCloseBracket();
        return true;
      case '<':
        return this.handleAngle();
      case '&':
        return this.handleEntity();
      case ':':
        return this.handleDirective();
      case 'h':
      case 'H':
      case 'w':
      case 'W':
        return this.handleBareUrl();
      default:
        return false;
    }
  }

  /** Consumes plain text up to the next special character (at least one character). */
  private consumeText(): void {
    const start = this.pos;
    SPECIAL.lastIndex = start + 1;
    const match = SPECIAL.exec(this.text);
    let stop = match && match.index < this.end ? match.index : this.end;
    // Keep trailing spaces before a newline out of the text (they may form a hard break).
    this.pos = stop;
    if (this.text[stop] === '\n') {
      while (stop > start && this.text[stop - 1] === ' ') stop--;
      if (stop < this.pos) {
        this.appendText(this.text.slice(start, stop), start, stop);
        this.appendText(this.text.slice(stop, this.pos), stop, this.pos);
        return;
      }
    }
    this.appendText(this.text.slice(start, stop), start, stop);
  }

  // -------------------------------------------------------------------------
  // Handlers

  private handleNewline(): void {
    const newline = this.pos;
    this.pos++;
    // Trailing spaces: two or more make a hard break; any are dropped.
    const last = this.tail;
    if (last && last.node.type === 'text' && / +$/.test(last.node.value)) {
      const spaces = / +$/.exec(last.node.value)![0].length;
      last.node.value = last.node.value.slice(0, -spaces);
      const breakStart = last.e - spaces;
      last.e = breakStart;
      if (spaces >= 2) {
        this.append({ type: 'break', position: NO_POS } satisfies Break, breakStart, newline + 1);
        this.skipLeadingSpaces();
        return;
      }
    }
    this.appendText('\n', newline, newline + 1);
    this.skipLeadingSpaces();
  }

  private skipLeadingSpaces(): void {
    while (this.pos < this.end && (this.text[this.pos] === ' ' || this.text[this.pos] === '\t')) this.pos++;
  }

  private handleBackslash(): void {
    const start = this.pos;
    const next = this.text[start + 1];
    if (next === '\n' && start + 1 < this.end) {
      this.append({ type: 'break', position: NO_POS } satisfies Break, start, start + 2);
      this.pos = start + 2;
      this.skipLeadingSpaces();
      return;
    }
    if (start + 1 < this.end && isAsciiPunctuation(next)) {
      this.appendText(next!, start, start + 2);
      this.pos = start + 2;
      return;
    }
    this.appendText('\\', start, start + 1);
    this.pos = start + 1;
  }

  private handleBackticks(): void {
    const start = this.pos;
    let n = 0;
    while (this.text[start + n] === '`') n++;
    const afterOpen = start + n;
    const known = this.backtickNoClose.get(n);
    if (known === undefined || known > afterOpen) {
      let search = afterOpen;
      while (search < this.end) {
        const found = this.text.indexOf('`', search);
        if (found === -1 || found >= this.end) break;
        let m = 0;
        while (this.text[found + m] === '`') m++;
        if (m === n && found + m <= this.end) {
          let content = this.text.slice(afterOpen, found).replace(/\n/g, ' ');
          if (this.tableCell) content = content.replace(/\\\|/g, '|');
          if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim().length > 0) {
            content = content.slice(1, -1);
          }
          this.append({ type: 'inlineCode', value: content, position: NO_POS } satisfies InlineCode, start, found + m);
          this.pos = found + m;
          return;
        }
        search = found + m;
      }
      this.backtickNoClose.set(n, afterOpen);
    }
    this.appendText('`'.repeat(n), start, afterOpen);
    this.pos = afterOpen;
  }

  private handleDelimiters(char: '*' | '_' | '~'): void {
    const start = this.pos;
    let n = 0;
    while (this.text[start + n] === char && start + n < this.end) n++;
    const end = start + n;
    const before = start === 0 ? undefined : charBefore(this.text, start);
    const after = end >= this.end ? undefined : charAt(this.text, end);
    const wsBefore = isUnicodeWhitespace(before);
    const wsAfter = isUnicodeWhitespace(after);
    const punctBefore = isUnicodePunctuation(before);
    const punctAfter = isUnicodePunctuation(after);
    const left = !wsAfter && (!punctAfter || wsBefore || punctBefore);
    const right = !wsBefore && (!punctBefore || wsAfter || punctAfter);
    let canOpen: boolean;
    let canClose: boolean;
    if (char === '_') {
      canOpen = left && (!right || punctBefore);
      canClose = right && (!left || punctAfter);
    } else {
      canOpen = left;
      canClose = right;
    }
    const lnode = this.appendText(char.repeat(n), start, end);
    this.pos = end;
    if (canOpen || canClose) {
      const delimiter: Delimiter = { lnode, char, count: n, origCount: n, canOpen, canClose, prev: this.delimiters, next: null };
      if (this.delimiters) this.delimiters.next = delimiter;
      this.delimiters = delimiter;
    }
  }

  /** `~~strike~~`: only runs of exactly two tildes are delimiters. */
  private handleTilde(): boolean {
    let n = 0;
    while (this.text[this.pos + n] === '~') n++;
    if (n !== 2) {
      this.appendText('~'.repeat(n), this.pos, this.pos + n);
      this.pos += n;
      return true;
    }
    this.handleDelimiters('~');
    return true;
  }

  private handleOpenBracket(): boolean {
    const start = this.pos;
    // Footnote reference: [^label]
    if (this.text[start + 1] === '^') {
      const m = /^\[\^([^\]\s[]{1,100})\]/.exec(this.text.slice(start, Math.min(this.end, start + 104)));
      if (m) {
        const label = m[1]!;
        this.append(
          { type: 'footnoteReference', label, identifier: normalizeLabel(label), position: NO_POS } satisfies FootnoteReference,
          start,
          start + m[0].length,
        );
        this.pos = start + m[0].length;
        return true;
      }
    }
    const lnode = this.appendText('[', start, start + 1);
    this.pushBracket(lnode, false, start + 1);
    this.pos = start + 1;
    return true;
  }

  private pushBracket(lnode: LNode, image: boolean, contentStart: number): void {
    if (this.brackets) this.brackets.bracketAfter = true;
    this.brackets = { lnode, image, active: true, contentStart, prevDelimiter: this.delimiters, prev: this.brackets, bracketAfter: false };
  }

  private handleCloseBracket(): void {
    const closeStart = this.pos;
    this.pos++;
    const opener = this.brackets;
    if (!opener) {
      this.appendText(']', closeStart, closeStart + 1);
      return;
    }
    if (!opener.active) {
      this.brackets = opener.prev;
      this.appendText(']', closeStart, closeStart + 1);
      return;
    }

    let url: string | null = null;
    let title: string | null = null;
    let kind: 'inline' | 'reference' = 'inline';
    let end = this.pos;

    // Inline link: ](dest "title")
    if (this.text[this.pos] === '(') {
      let p = skipSpaceAndNewline(this.text, this.pos + 1);
      const dest = this.text[p] === ')' ? { end: p, url: '' } : scanLinkDestination(this.text, p);
      if (dest && dest.end <= this.end) {
        p = skipSpaceAndNewline(this.text, dest.end);
        let parsedTitle: { end: number; title: string } | null = null;
        if (p > dest.end) parsedTitle = scanLinkTitle(this.text, p);
        if (parsedTitle) p = skipSpaceAndNewline(this.text, parsedTitle.end);
        if (this.text[p] === ')' && p < this.end) {
          url = dest.url;
          title = parsedTitle?.title ?? null;
          end = p + 1;
        }
      }
    }

    // Reference links: [text][label], [text][], [text]
    if (url === null) {
      const labelText = this.text.slice(opener.contentStart, closeStart);
      let refLabel: string | null = null;
      let afterRef = this.pos;
      const full = scanLinkLabel(this.text, this.pos);
      if (full && full.end <= this.end) {
        refLabel = full.label;
        afterRef = full.end;
      } else if (!opener.bracketAfter) {
        // Collapsed `[text][]` or shortcut `[text]`: the text is the label (it cannot contain brackets).
        refLabel = labelText;
        if (this.text[this.pos] === '[' && this.text[this.pos + 1] === ']') afterRef = this.pos + 2;
      }
      if (refLabel !== null && refLabel.trim().length > 0 && refLabel.length <= 999) {
        const definition = this.ctx.definitions.get(normalizeLabel(refLabel));
        if (definition) {
          url = definition.url;
          title = definition.title;
          kind = 'reference';
          end = afterRef;
        }
      }
    }

    if (url === null) {
      this.brackets = opener.prev;
      this.appendText(']', closeStart, closeStart + 1);
      return;
    }

    // Build the link or image from the nodes after the opener.
    this.processEmphasis(opener.prevDelimiter);
    const children = this.detachAfter(opener.lnode);
    const openerStart = opener.lnode.s;
    this.remove(opener.lnode);
    this.brackets = opener.prev;
    this.pos = end;

    if (opener.image) {
      let attributes: Attributes | null = null;
      if (this.text[end] === '{' && looksLikeAttributes(this.text, end)) {
        const close = findAttributeBlockEnd(this.text, end, this.end);
        if (close !== -1) {
          attributes = parseAttributes(
            this.text,
            end,
            { index: this.ctx.index, diagnostics: this.ctx.diagnostics, toOffset: (i) => this.src.toOffset(i) },
            close + 1,
          ).attributes;
          end = close + 1;
          this.pos = end;
        }
      }
      const inner = finalizeChain(children, this);
      const image: Image = { type: 'image', url, title, alt: plainText(inner), attributes, position: NO_POS };
      this.append(image, openerStart, end);
    } else {
      const inner = unwrapLinks(finalizeChain(children, this));
      const link: Link = { type: 'link', kind, url, title, children: inner, position: NO_POS };
      this.append(link, openerStart, end);
      // No links inside links: deactivate earlier `[` openers.
      for (let b = this.brackets; b; b = b.prev) if (!b.image) b.active = false;
    }
  }

  private handleAngle(): boolean {
    const start = this.pos;
    const rest = this.text.slice(start, Math.min(this.end, start + 4096));
    // Comment
    if (rest.startsWith('<!--')) {
      const close = this.text.indexOf('-->', start + 4);
      if (close !== -1 && close + 3 <= this.end) {
        this.append({ type: 'comment', value: this.text.slice(start + 4, close), closed: true, position: NO_POS } satisfies Comment, start, close + 3);
        this.pos = close + 3;
        return true;
      }
      return false;
    }
    // URI autolink
    let m = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(rest);
    if (m) {
      this.append({ type: 'link', kind: 'autolink', url: m[1]!, title: null, children: [this.textNode(m[1]!, start + 1, start + 1 + m[1]!.length)], position: NO_POS } satisfies Link, start, start + m[0].length);
      this.pos = start + m[0].length;
      return true;
    }
    // Email autolink
    m = /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/.exec(rest);
    if (m) {
      this.append({ type: 'link', kind: 'autolink', url: `mailto:${m[1]!}`, title: null, children: [this.textNode(m[1]!, start + 1, start + 1 + m[1]!.length)], position: NO_POS } satisfies Link, start, start + m[0].length);
      this.pos = start + m[0].length;
      return true;
    }
    return false;
  }

  private handleEntity(): boolean {
    const match = matchEntity(this.text, this.pos);
    if (!match || this.pos + match.length > this.end) return false;
    this.appendText(match.value, this.pos, this.pos + match.length);
    this.pos += match.length;
    return true;
  }

  /** `:name[label]{attrs}` */
  private handleDirective(): boolean {
    const start = this.pos;
    const before = charBefore(this.text, start);
    if (before === ':' || isAlphanumeric(before)) return false;
    const nameStart = start + 1;
    const nameEnd = readName(this.text, nameStart);
    if (nameEnd === nameStart || nameEnd > this.end) return false;
    const next = this.text[nameEnd];
    if (next !== '[' && next !== '{') return false;
    const name = this.text.slice(nameStart, nameEnd);
    const known = this.ctx.registry.has(name);

    let pos = nameEnd;
    let labelStart = -1;
    let labelEnd = -1;
    if (next === '[') {
      const close = findInlineLabelEnd(this.text, pos, this.end);
      if (close === -1) {
        if (known) {
          this.ctx.diagnostics.report('MU1007', this.range(start, Math.min(this.end, pos + 1)), `Unterminated label for \`:${name}\`: expected \`]\`.`);
        }
        return false;
      }
      labelStart = pos + 1;
      labelEnd = close;
      pos = close + 1;
    }
    let attributes: Attributes | null = null;
    if (this.text[pos] === '{') {
      const close = findAttributeBlockEnd(this.text, pos, this.end);
      if (close === -1) {
        if (known) {
          this.ctx.diagnostics.report('MU1008', this.range(pos, Math.min(this.end, pos + 1)), `Unterminated attribute block for \`:${name}\`: expected \`}\`.`);
        } else if (labelStart === -1) {
          return false;
        }
      } else {
        attributes = parseAttributes(
          this.text,
          pos,
          { index: this.ctx.index, diagnostics: this.ctx.diagnostics, toOffset: (i) => this.src.toOffset(i) },
          close + 1,
        ).attributes;
        pos = close + 1;
      }
    }
    if (labelStart === -1 && attributes === null) return false;

    let label: Inline[] | null = null;
    let rawLabel: string | null = null;
    if (labelStart !== -1) {
      rawLabel = this.text.slice(labelStart, labelEnd).replace(/\\([!-/:-@[-`{-~])/g, '$1');
      if (this.ctx.registry.labelModel(name) === 'raw') {
        label = [this.textNode(rawLabel, labelStart, labelEnd)];
      } else if (this.depth + 1 > MAX_INLINE_DEPTH) {
        this.ctx.diagnostics.report('MU1015', this.range(labelStart, labelEnd), `Directive labels are nested more than ${MAX_INLINE_DEPTH} levels deep; this label is kept as text.`);
        label = [this.textNode(this.text.slice(labelStart, labelEnd), labelStart, labelEnd)];
      } else {
        label = parseInlines(this.src, this.ctx, { start: labelStart, end: labelEnd, depth: this.depth + 1, tableCell: this.tableCell });
      }
    }
    const node: InlineDirective = {
      type: 'inlineDirective',
      name,
      nameRange: this.range(nameStart, nameEnd),
      label,
      rawLabel,
      labelRange: labelStart === -1 ? null : this.range(labelStart - 1, labelEnd + 1),
      attributes,
      position: NO_POS,
    };
    this.append(node, start, pos);
    this.pos = pos;
    return true;
  }

  /** GFM extended autolinks: `https://…`, `http://…`, `www.…` at a word boundary. */
  private handleBareUrl(): boolean {
    const start = this.pos;
    const before = charBefore(this.text, start);
    if (!(before === undefined || isUnicodeWhitespace(before) || before === '*' || before === '_' || before === '~' || before === '(' || before === '"' || before === "'")) {
      return false;
    }
    const head = this.text.slice(start, start + 8).toLowerCase();
    const www = head.startsWith('www.');
    if (!www && !head.startsWith('http://') && !head.startsWith('https://')) return false;
    let end = start;
    while (end < this.end && !/[\s<]/.test(this.text[end]!)) end++;
    // Trailing punctuation is not part of the link.
    while (end > start) {
      const c = this.text[end - 1]!;
      if ('?!.,:*_~\'"'.includes(c)) {
        end--;
        continue;
      }
      if (c === ')') {
        const candidate = this.text.slice(start, end);
        const opens = (candidate.match(/\(/g) ?? []).length;
        const closes = (candidate.match(/\)/g) ?? []).length;
        if (closes > opens) {
          end--;
          continue;
        }
      }
      if (c === ';') {
        const entity = /&[A-Za-z0-9]+;$/.exec(this.text.slice(start, end));
        if (entity) {
          end -= entity[0].length;
          continue;
        }
      }
      break;
    }
    const raw = this.text.slice(start, end);
    const host = raw.replace(/^(https?:\/\/|www\.)/i, '');
    if (!/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*/.test(host) || host.length === 0 || (www && !host.includes('.'))) return false;
    const url = www ? `http://${raw}` : raw;
    this.append({ type: 'link', kind: 'bare', url, title: null, children: [this.textNode(raw, start, end)], position: NO_POS } satisfies Link, start, end);
    this.pos = end;
    return true;
  }

  // -------------------------------------------------------------------------
  // Emphasis

  private processEmphasis(stackBottom: Delimiter | null): void {
    const openersBottom = new Map<string, Delimiter | null>();
    // Start from the lowest delimiter above stackBottom.
    let closer: Delimiter | null = null;
    for (let d = this.delimiters; d && d !== stackBottom; d = d.prev) closer = d;
    while (closer) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const key = `${closer.char}${closer.canOpen ? 1 : 0}${closer.origCount % 3}`;
      const bottom = openersBottom.has(key) ? openersBottom.get(key)! : stackBottom;
      let opener = closer.prev;
      let found = false;
      while (opener && opener !== stackBottom && opener !== bottom) {
        const oddMatch =
          (closer.canOpen || opener.canClose) && closer.origCount % 3 !== 0 && (opener.origCount + closer.origCount) % 3 === 0;
        if (opener.char === closer.char && opener.canOpen && (closer.char === '~' ? opener.count === closer.count : !oddMatch)) {
          found = true;
          break;
        }
        opener = opener.prev;
      }
      const oldCloser = closer;
      if (found && opener) {
        const use = closer.char === '~' ? 2 : closer.count >= 2 && opener.count >= 2 ? 2 : 1;
        const tooDeep = nestingDepth(opener.lnode.next, closer.lnode) + 1 > MAX_INLINE_DEPTH;
        if (tooDeep) {
          closer = closer.next;
          this.removeDelimiter(oldCloser);
          continue;
        }
        opener.count -= use;
        closer.count -= use;
        const openerText = opener.lnode.node as Text;
        const closerText = closer.lnode.node as Text;
        openerText.value = openerText.value.slice(0, opener.count);
        closerText.value = closerText.value.slice(use);
        opener.lnode.e -= use;
        closer.lnode.s += use;
        const nodeStart = opener.lnode.e;
        const nodeEnd = closer.lnode.s;

        const children = this.detachBetween(opener.lnode, closer.lnode);
        const inner = finalizeChain(children, this);
        const node: Emphasis | Strong | Delete =
          closer.char === '~'
            ? { type: 'delete', children: inner, position: NO_POS }
            : use === 1
              ? { type: 'emphasis', children: inner, position: NO_POS }
              : { type: 'strong', children: inner, position: NO_POS };
        this.insertAfter(opener.lnode, { node, s: nodeStart, e: nodeEnd, prev: null, next: null });

        // Delimiters between opener and closer are now inside the node.
        opener.next = closer;
        closer.prev = opener;

        if (opener.count === 0) {
          this.remove(opener.lnode);
          this.removeDelimiter(opener);
        }
        if (closer.count === 0) {
          const next = closer.next;
          this.remove(closer.lnode);
          this.removeDelimiter(closer);
          closer = next;
        }
      } else {
        closer = closer.next;
        openersBottom.set(key, oldCloser.prev);
        if (!oldCloser.canOpen) this.removeDelimiter(oldCloser);
      }
    }
    // Remove every delimiter above stackBottom.
    while (this.delimiters && this.delimiters !== stackBottom) this.removeDelimiter(this.delimiters);
  }

  private removeDelimiter(d: Delimiter): void {
    if (d.prev) d.prev.next = d.next;
    if (d.next) d.next.prev = d.prev;
    else this.delimiters = d.prev;
  }

  // -------------------------------------------------------------------------
  // Linked list

  private append(node: Inline, s: number, e: number): LNode {
    const lnode: LNode = { node, s, e, prev: this.tail, next: null };
    if (this.tail) this.tail.next = lnode;
    else this.head = lnode;
    this.tail = lnode;
    return lnode;
  }

  private appendText(value: string, s: number, e: number): LNode {
    return this.append({ type: 'text', value, position: NO_POS } satisfies Text, s, e);
  }

  private textNode(value: string, s: number, e: number): Text {
    return { type: 'text', value, position: this.range(s, e) };
  }

  private insertAfter(after: LNode, lnode: LNode): void {
    lnode.prev = after;
    lnode.next = after.next;
    if (after.next) after.next.prev = lnode;
    else this.tail = lnode;
    after.next = lnode;
  }

  private remove(lnode: LNode): void {
    if (lnode.prev) lnode.prev.next = lnode.next;
    else this.head = lnode.next;
    if (lnode.next) lnode.next.prev = lnode.prev;
    else this.tail = lnode.prev;
    lnode.prev = lnode.next = null;
  }

  /** Detaches every node after `after` and returns the first of them. */
  private detachAfter(after: LNode): LNode | null {
    const first = after.next;
    if (!first) return null;
    after.next = null;
    first.prev = null;
    this.tail = after;
    return first;
  }

  /** Detaches the nodes strictly between `a` and `b`; returns the first of them. */
  private detachBetween(a: LNode, b: LNode): LNode | null {
    const first = a.next;
    if (!first || first === b) return null;
    const last = b.prev!;
    a.next = b;
    b.prev = a;
    first.prev = null;
    last.next = null;
    return first;
  }

  range(s: number, e: number): Range {
    return this.ctx.index.range(this.src.toOffset(s), this.src.toOffset(e));
  }
}

const NO_POS: Range = { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } };

/** Converts a detached chain into finished nodes: assigns positions and merges text. */
function finalizeChain(first: LNode | null, parser: InlineParser): Inline[] {
  const out: Inline[] = [];
  for (let n = first; n; n = n.next) {
    if (n.node.position === NO_POS) n.node.position = parser.range(n.s, n.e);
    out.push(n.node);
  }
  return mergeText(out);
}

function finalizeList(head: LNode | null, parser: InlineParser): Inline[] {
  return finalizeChain(head, parser);
}

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.value.length === 0) continue;
      const last = out[out.length - 1];
      if (last?.type === 'text') {
        out[out.length - 1] = { type: 'text', value: last.value + node.value, position: { start: last.position.start, end: node.position.end } };
        continue;
      }
    }
    out.push(node);
  }
  return out;
}

function unwrapLinks(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.type === 'link') out.push(...unwrapLinks(node.children));
    else out.push(node);
  }
  return out;
}

function nestingDepth(from: LNode | null, until: LNode): number {
  let max = 0;
  for (let n = from; n && n !== until; n = n.next) max = Math.max(max, inlineDepth(n.node));
  return max;
}

const depthCache = new WeakMap<Inline, number>();

function inlineDepth(node: Inline): number {
  const cached = depthCache.get(node);
  if (cached !== undefined) return cached;
  let depth = 0;
  if ('children' in node && node.children) {
    for (const child of node.children) depth = Math.max(depth, inlineDepth(child) + 1);
  }
  depthCache.set(node, depth);
  return depth;
}

/** Plain text of inline nodes (used for image alt text). */
export function plainText(nodes: readonly Inline[]): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
        out += node.value;
        break;
      case 'break':
        out += '\n';
        break;
      case 'image':
        out += node.alt;
        break;
      case 'inlineDirective':
        out += node.label ? plainText(node.label) : '';
        break;
      case 'comment':
      case 'footnoteReference':
        break;
      default:
        out += plainText(node.children);
    }
  }
  return out;
}

/** Finds the `]` closing an inline directive label (nesting, escapes and code spans honoured). */
function findInlineLabelEnd(text: string, open: number, limit: number): number {
  let depth = 0;
  for (let i = open; i < limit; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '`') {
      let run = 0;
      while (text[i + run] === '`') run++;
      const close = text.indexOf('`'.repeat(run), i + run);
      i = (close === -1 || close >= limit ? i : close) + run - 1;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
