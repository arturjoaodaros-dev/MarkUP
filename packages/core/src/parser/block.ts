/**
 * Block parser.
 *
 * A line-oriented state machine in the style of the CommonMark reference
 * algorithm. For every line:
 *
 * 1. the open blocks are matched from the root down; containers consume their
 *    prefixes (`>`, list indentation) and leaves decide whether they continue;
 * 2. a matched leaf that takes raw lines (code, raw/data directive bodies,
 *    comments) receives the line;
 * 3. otherwise block starts are tried — each may open a container and loop;
 * 4. what remains is lazy paragraph continuation, paragraph text, a table row
 *    or a blank line.
 *
 * MarkUP adds fence-delimited directive containers. They never consume a
 * prefix, so they always match; a line of colons closes the innermost directive
 * at the current nesting level (docs/spec.md §5.3).
 *
 * Inline content is not parsed here: paragraphs, headings, table cells and
 * directive labels are queued as {@link InlineJob}s and parsed once every link
 * reference definition in the document is known.
 */
import type {
  Attributes,
  Block,
  Blockquote,
  Code,
  Comment,
  ContainerDirective,
  Definition,
  Directive,
  Document,
  FootnoteDefinition,
  FrontMatter,
  Heading,
  HeadingDepth,
  Inline,
  LeafDirective,
  List,
  ListItem,
  Paragraph,
  Table,
  TableAlign,
  TableCell,
  TableRow,
  ThematicBreak,
} from '../ast.ts';
import { parseData } from '../data/parse.ts';
import type { DiagnosticBag, DiagnosticFix, RelatedInformation } from '../diagnostics.ts';
import type { ContentModel, DirectiveRegistry } from '../directives/spec.ts';
import { isBlank, scanLines, TAB_SIZE, type SourceLine } from '../source/lines.ts';
import type { LineIndex, Range } from '../source/position.ts';
import {
  findAttributeBlockEnd,
  looksLikeAttributes,
  parseAttributes,
} from '../syntax/attributes.ts';
import { readName } from '../syntax/chars.ts';
import { normalizeLabel, parseDefinition } from './links.ts';
import { SegmentText, type Segment } from './segments.ts';

/** Maximum nesting of container blocks (blockquotes, lists, directives, footnotes). */
export const MAX_BLOCK_DEPTH = 64;

export type InlineJob =
  | { kind: 'content'; node: { children: Inline[] }; source: SegmentText; tableCell: boolean }
  | { kind: 'label'; node: Directive; source: SegmentText };

export interface BlockParseResult {
  document: Document;
  jobs: InlineJob[];
  definitions: Map<string, Definition>;
  footnotes: Map<string, FootnoteDefinition>;
}

// ---------------------------------------------------------------------------
// Open block model

interface ContainerBase {
  parent: OpenContainer | null;
  child: OpenBlock | null;
  start: number;
  /** End offset of the last non-blank content seen. */
  end: number;
  depth: number;
  /** A blank line reached this container and no content line has since. */
  sawBlank: boolean;
}

interface OpenDocument extends ContainerBase {
  kind: 'document';
  node: Document;
}

interface OpenBlockquote extends ContainerBase {
  kind: 'blockquote';
  node: Blockquote;
}

interface OpenList extends ContainerBase {
  kind: 'list';
  node: List;
  bullet: string;
  delimiter: string | null;
}

interface OpenListItem extends ContainerBase {
  kind: 'listItem';
  node: ListItem;
  /** Columns (relative to the parent's content) that continuation lines must be indented. */
  contentIndent: number;
}

interface OpenDirective extends ContainerBase {
  kind: 'directive';
  node: ContainerDirective;
  fence: number;
}

interface OpenFootnote extends ContainerBase {
  kind: 'footnote';
  node: FootnoteDefinition;
}

type OpenContainer =
  OpenDocument | OpenBlockquote | OpenList | OpenListItem | OpenDirective | OpenFootnote;

interface LeafBase {
  parent: OpenContainer;
  start: number;
  end: number;
}

interface OpenParagraph extends LeafBase {
  kind: 'paragraph';
  lines: Segment[];
}

interface OpenCode extends LeafBase {
  kind: 'code';
  node: Code;
  fenceChar: string;
  fenceLength: number;
  fenceIndent: number;
  lines: string[];
}

interface OpenRaw extends LeafBase {
  kind: 'raw';
  node: ContainerDirective;
  model: Exclude<ContentModel, 'flow'>;
  fence: number;
  fenceIndent: number;
  lines: Segment[];
}

interface OpenComment extends LeafBase {
  kind: 'comment';
  lines: string[];
  closed: boolean;
}

interface OpenTable extends LeafBase {
  kind: 'table';
  node: Table;
  columns: number;
}

type OpenLeaf = OpenParagraph | OpenCode | OpenRaw | OpenComment | OpenTable;
type OpenBlock = OpenContainer | OpenLeaf;

function isContainer(block: OpenBlock): block is OpenContainer {
  switch (block.kind) {
    case 'document':
    case 'blockquote':
    case 'list':
    case 'listItem':
    case 'directive':
    case 'footnote':
      return true;
    default:
      return false;
  }
}

/** Why a block is being closed — used to explain unclosed directives and code. */
type CloseReason =
  | { kind: 'normal' }
  | { kind: 'eof' }
  | { kind: 'parent'; parent: OpenContainer }
  | { kind: 'fence'; target: OpenDirective; fence: Range };

const NORMAL: CloseReason = { kind: 'normal' };

// ---------------------------------------------------------------------------

export function parseBlocks(
  source: string,
  index: LineIndex,
  diagnostics: DiagnosticBag,
  registry: DirectiveRegistry,
): BlockParseResult {
  return new BlockParser(source, index, diagnostics, registry).parse();
}

class BlockParser {
  private readonly source: string;
  private readonly index: LineIndex;
  private readonly diagnostics: DiagnosticBag;
  private readonly registry: DirectiveRegistry;
  private readonly lines: SourceLine[];
  private readonly root: OpenDocument;
  private tip: OpenBlock;
  private readonly jobs: InlineJob[] = [];
  private readonly definitions = new Map<string, Definition>();
  private readonly footnotes = new Map<string, FootnoteDefinition>();

  // Per-line state.
  private line: SourceLine = { index: 0, start: 0, end: 0, text: '', eolLength: 0 };
  private text = '';
  private pos = 0;
  private column = 0;
  private blank = false;
  /** Index and visual column of the first non-whitespace character of the line. */
  private leadingEnd = 0;
  private leadingEndColumn = 0;
  /** Deepest container matched by the current line. */
  private matched: OpenContainer;
  /** Deepest block (container or leaf) matched by the current line; blocks below it are unmatched. */
  private matchedBlock: OpenBlock;
  /** Unmatched blocks have already been closed on this line. */
  private unmatchedClosed = false;
  private depthReportedLine = -1;
  /** Code block left open at the end of input (to explain unclosed directives). */
  private unclosedCodeAtEof: Code | null = null;

  constructor(
    source: string,
    index: LineIndex,
    diagnostics: DiagnosticBag,
    registry: DirectiveRegistry,
  ) {
    this.source = source;
    this.index = index;
    this.diagnostics = diagnostics;
    this.registry = registry;
    this.lines = scanLines(source);
    const document: Document = {
      type: 'document',
      frontMatter: null,
      children: [],
      position: index.range(0, source.length),
    };
    this.root = {
      kind: 'document',
      node: document,
      parent: null,
      child: null,
      start: 0,
      end: 0,
      depth: 0,
      sawBlank: false,
    };
    this.tip = this.root;
    this.matched = this.root;
    this.matchedBlock = this.root;
  }

  parse(): BlockParseResult {
    let first = 0;
    const frontMatter = this.parseFrontMatter();
    if (frontMatter) {
      this.root.node.frontMatter = frontMatter.node;
      first = frontMatter.nextLine;
    }
    for (let i = first; i < this.lines.length; i++) this.processLine(this.lines[i]!);
    while (this.tip !== this.root) this.close(this.tip, { kind: 'eof' });
    return {
      document: this.root.node,
      jobs: this.jobs,
      definitions: this.definitions,
      footnotes: this.footnotes,
    };
  }

  // -------------------------------------------------------------------------
  // Front matter

  private parseFrontMatter(): { node: FrontMatter; nextLine: number } | null {
    const first = this.lines[0];
    if (!first || first.text.trimEnd() !== '---') return null;
    let close = -1;
    for (let i = 1; i < this.lines.length; i++) {
      const t = this.lines[i]!.text.trimEnd();
      if (t === '---' || t === '...') {
        close = i;
        break;
      }
    }
    if (close === -1) {
      const second = this.lines[1];
      if (second && /^[A-Za-z_][\w-]*:(\s|$)/.test(second.text)) {
        this.diagnostics.report(
          'MU1016',
          this.index.range(first.start, first.end),
          'Front matter is not closed: add a `---` line after it. Without one, this `---` is a thematic break.',
        );
      }
      return null;
    }
    const body = this.lines.slice(1, close);
    const value = parseData(
      body.map((l) => ({ text: l.text, offset: l.start })),
      this.index,
      this.diagnostics,
    );
    const closing = this.lines[close]!;
    const node: FrontMatter = {
      type: 'frontMatter',
      value,
      raw: body.map((l) => l.text).join('\n'),
      position: this.index.range(first.start, closing.end),
    };
    return { node, nextLine: close + 1 };
  }

  // -------------------------------------------------------------------------
  // Line processing

  private processLine(line: SourceLine): void {
    this.line = line;
    this.text = line.text;
    this.pos = 0;
    this.column = 0;
    this.unmatchedClosed = false;
    this.leadingEnd = -1; // Disable the fast path while measuring.
    const leading = this.peekIndent();
    this.leadingEnd = leading.pos;
    this.leadingEndColumn = leading.column;
    this.blank = this.leadingEnd >= this.text.length;

    // 1. Match open blocks against the line.
    let container: OpenContainer = this.root;
    let allMatched = true;
    let leafMatched = false;
    this.matchedBlock = this.root;
    while (container.child) {
      const child: OpenBlock = container.child;
      // Blankness is judged after the prefixes consumed so far: `>` alone is a blank line inside a quote.
      this.blank = this.restBlank();
      const result = this.continueBlock(child);
      if (result === 'consumed') return;
      if (result === 'unmatched') {
        allMatched = false;
        break;
      }
      this.matchedBlock = child;
      if (isContainer(child)) {
        container = child;
      } else {
        leafMatched = true;
        break;
      }
    }
    this.matched = container;
    this.blank = this.restBlank();

    // 2. Raw-line leaves.
    const tip = this.tip;
    if (
      allMatched &&
      leafMatched &&
      (tip.kind === 'code' || tip.kind === 'raw' || tip.kind === 'comment')
    ) {
      this.addRawLine(tip);
      return;
    }

    // 3. Block starts.
    const paragraph =
      allMatched && tip.kind === 'paragraph' && tip.parent === container ? tip : null;
    let current: OpenContainer = container;
    let started = false;
    while (!this.blank) {
      const outcome = this.tryBlockStart(current, started ? null : paragraph);
      if (outcome === null) break;
      started = true;
      if (outcome === 'done') return;
      current = outcome;
      if (this.restBlank()) break;
    }

    // 4. The rest of the line.
    if (!started && !allMatched && !this.blank && this.tip.kind === 'paragraph') {
      this.addParagraphLine(this.tip); // Lazy continuation.
      return;
    }
    this.closeUnmatched();
    if (this.blank) {
      if (this.tip.kind === 'paragraph' || this.tip.kind === 'table') this.close(this.tip, NORMAL);
      for (let b: OpenContainer | null = current; b; b = b.parent) b.sawBlank = true;
      return;
    }
    if (this.restBlank()) return; // A container marker with nothing after it, e.g. `>`.
    const open = this.tip;
    if (open.kind === 'paragraph' && open.parent === current) this.addParagraphLine(open);
    else if (open.kind === 'table' && open.parent === current) this.addTableRow(open);
    else this.startParagraph(current);
  }

  /** Tries to continue `block` with the current line, consuming its prefix. */
  private continueBlock(block: OpenBlock): 'matched' | 'unmatched' | 'consumed' {
    switch (block.kind) {
      case 'document':
      case 'list':
      case 'directive':
      case 'comment':
        return 'matched';
      case 'blockquote': {
        const indent = this.peekIndent();
        if (this.text[indent.pos] !== '>') return 'unmatched';
        this.advanceTo(indent.pos, indent.column);
        this.consumeBlockquoteMarker();
        return 'matched';
      }
      case 'listItem': {
        if (this.blank) {
          // An item that starts empty cannot be followed by a blank line.
          return block.node.children.length === 0 && block.child === null ? 'unmatched' : 'matched';
        }
        const indent = this.peekIndent();
        if (indent.column - this.column < block.contentIndent) return 'unmatched';
        this.advanceColumns(block.contentIndent);
        return 'matched';
      }
      case 'footnote': {
        if (this.blank) return 'matched';
        const indent = this.peekIndent();
        const rel = indent.column - this.column;
        if (rel < 2) return 'unmatched';
        this.advanceColumns(Math.min(4, rel));
        return 'matched';
      }
      case 'paragraph':
      case 'table':
        return this.blank ? 'unmatched' : 'matched';
      case 'code': {
        const indent = this.peekIndent();
        const rel = indent.column - this.column;
        if (rel <= block.fenceIndent + 3) {
          const run = countRun(this.text, indent.pos, block.fenceChar);
          if (run >= block.fenceLength && isBlank(this.text, indent.pos + run)) {
            block.end = this.line.start + indent.pos + run;
            block.node.closed = true;
            this.close(block, NORMAL);
            return 'consumed';
          }
        }
        this.advanceColumns(Math.min(block.fenceIndent, rel));
        return 'matched';
      }
      case 'raw': {
        const indent = this.peekIndent();
        const run = countRun(this.text, indent.pos, ':');
        if (run >= block.fence && isBlank(this.text, indent.pos + run)) {
          const fenceStart = this.line.start + indent.pos;
          block.node.closed = true;
          block.node.closeRange = this.index.range(fenceStart, fenceStart + run);
          block.end = fenceStart + run;
          this.close(block, NORMAL);
          return 'consumed';
        }
        this.advanceColumns(Math.min(block.fenceIndent, indent.column - this.column));
        return 'matched';
      }
    }
  }

  /**
   * Tries every block start at the current position. Returns the container to
   * keep matching in, `'done'` when the line was fully consumed, or null.
   * `paragraph` is the open paragraph this line would interrupt, if any.
   */
  private tryBlockStart(
    container: OpenContainer,
    paragraph: OpenParagraph | null,
  ): OpenContainer | 'done' | null {
    const base = this.column;
    const indent = this.peekIndent();
    const p = indent.pos;
    const relIndent = indent.column - base;
    const c = this.text[p];
    const lineStart = this.line.start;

    switch (c) {
      case '>': {
        if (!this.checkDepth(container, 1)) return null;
        this.advanceTo(p, indent.column);
        this.consumeBlockquoteMarker();
        const node: Blockquote = {
          type: 'blockquote',
          children: [],
          position: this.index.range(lineStart + p, lineStart + p),
        };
        return this.addContainer(container, {
          kind: 'blockquote',
          node,
          parent: null,
          child: null,
          start: lineStart + p,
          end: this.line.end,
          depth: 0,
          sawBlank: false,
        });
      }
      case '`':
      case '~': {
        const run = countRun(this.text, p, c);
        const info = this.text.slice(p + run);
        if (run >= 3 && !(c === '`' && info.includes('`'))) {
          this.startCode(container, c, run, relIndent, p, info);
          return 'done';
        }
        break;
      }
      case ':': {
        if (this.text[p + 1] === ':') {
          const outcome = this.tryDirective(container, p, relIndent);
          if (outcome !== null) return outcome;
        }
        break;
      }
      case '#': {
        const heading = this.tryAtxHeading(p);
        if (heading) {
          this.addBlock(container, heading);
          return 'done';
        }
        break;
      }
      case '<': {
        if (this.text.startsWith('<!--', p)) {
          const endMarker = this.text.indexOf('-->', p + 4);
          if (endMarker === -1 || isBlank(this.text, endMarker + 3)) {
            this.startComment(container, p, endMarker);
            return 'done';
          }
        }
        break;
      }
      case '[': {
        // Footnote definitions cannot interrupt a paragraph — unless the "paragraph"
        // so far is only link reference definitions.
        if (this.text[p + 1] === '^' && (!paragraph || this.onlyDefinitions(paragraph))) {
          const match = /^\[\^([^\]\s]{1,100})\]:/.exec(this.text.slice(p));
          if (match && this.checkDepth(container, 1)) {
            const start = lineStart + p;
            const label = match[1]!;
            const node: FootnoteDefinition = {
              type: 'footnoteDefinition',
              label,
              identifier: normalizeLabel(label),
              children: [],
              position: this.index.range(start, start),
            };
            const block = this.addContainer(container, {
              kind: 'footnote',
              node,
              parent: null,
              child: null,
              start,
              end: this.line.end,
              depth: 0,
              sawBlank: false,
            });
            this.advanceTo(p + match[0].length, indent.column + match[0].length);
            this.skipSpaces();
            return block;
          }
        }
        break;
      }
    }

    // Setext underline and table delimiter rows turn the paragraph above into something else.
    if (paragraph && (c === '=' || c === '-') && /^(=+|-+)[ \t]*$/.test(this.text.slice(p))) {
      if (this.convertToSetext(paragraph, c === '=' ? 1 : 2)) return 'done';
    }
    if (paragraph && (c === '|' || c === ':' || c === '-') && this.tryTable(paragraph, p))
      return 'done';

    if ((c === '*' || c === '-' || c === '_') && isThematicBreak(this.text, p)) {
      const node: ThematicBreak = {
        type: 'thematicBreak',
        position: this.index.range(lineStart + p, this.line.end),
      };
      this.addBlock(container, node);
      return 'done';
    }

    const marker = parseListMarker(this.text, p);
    if (marker) {
      const restBlank = isBlank(this.text, marker.end);
      // A list may interrupt a paragraph only with a non-empty item, and an ordered one only from 1.
      if (!paragraph || (!restBlank && (!marker.ordered || marker.number === 1))) {
        if (this.checkDepth(container, 2))
          return this.startListItem(container, marker, p, base, indent.column);
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Directives

  private tryDirective(
    container: OpenContainer,
    p: number,
    relIndent: number,
  ): OpenContainer | 'done' | null {
    const text = this.text;
    const colons = countRun(text, p, ':');
    const afterColons = p + colons;
    const lineStart = this.line.start;

    if (colons >= 3 && isBlank(text, afterColons)) return this.closingFence(container, p, colons);

    let nameStart = afterColons;
    let nameEnd = readName(text, nameStart);
    if (nameEnd === nameStart) {
      // `::: name` (pandoc style): accepted, with a warning and a fix.
      const spaced = /^[ \t]+(?=[A-Za-z])/.exec(text.slice(afterColons));
      if (!spaced) {
        if (text[afterColons] === '{' || text[afterColons] === '[') {
          this.diagnostics.report(
            'MU1013',
            this.index.range(lineStart + p, lineStart + afterColons + 1),
            `Expected a directive name after the colons, e.g. \`${':'.repeat(colons)}note\`.`,
          );
        }
        return null;
      }
      nameStart = afterColons + spaced[0].length;
      nameEnd = readName(text, nameStart);
      const fixed = `${':'.repeat(colons)}${text.slice(nameStart, nameEnd)}`;
      this.diagnostics.report(
        'MU1006',
        this.index.range(lineStart + p, lineStart + nameEnd),
        `Write directive names directly after the colons: \`${fixed}\`.`,
        {
          fixes: [
            {
              title: `Remove the space: ${fixed}`,
              edits: [
                {
                  range: this.index.range(lineStart + afterColons, lineStart + nameStart),
                  newText: '',
                },
              ],
              preferred: true,
            },
          ],
        },
      );
    }

    const form = colons === 2 ? 'leaf' : 'container';
    if (form === 'container' && !this.checkDepth(container, 1)) return null;

    const name = text.slice(nameStart, nameEnd);
    const header = this.parseDirectiveHeader(nameEnd, name, form);
    const start = lineStart + p;
    const nameRange = this.index.range(lineStart + nameStart, lineStart + nameEnd);

    if (form === 'leaf') {
      const node: LeafDirective = {
        type: 'leafDirective',
        name,
        nameRange,
        label: null,
        rawLabel: header.rawLabel,
        labelRange: header.labelRange,
        attributes: header.attributes,
        position: this.index.range(start, lineStart + header.end),
      };
      this.addBlock(container, node);
      this.queueLabel(node, header.labelSegment);
      return 'done';
    }

    const model = this.registry.contentModel(name);
    const openRange = this.index.range(start, this.line.end);
    const node: ContainerDirective = {
      type: 'containerDirective',
      name,
      nameRange,
      label: null,
      rawLabel: header.rawLabel,
      labelRange: header.labelRange,
      attributes: header.attributes,
      fence: colons,
      body: { kind: 'flow', children: [] },
      closed: false,
      openRange,
      closeRange: null,
      position: openRange,
    };
    this.queueLabel(node, header.labelSegment);
    if (model === 'flow') {
      this.addContainer(container, {
        kind: 'directive',
        node,
        parent: null,
        child: null,
        start,
        end: this.line.end,
        depth: 0,
        sawBlank: false,
        fence: colons,
      });
    } else {
      this.addLeaf(container, {
        kind: 'raw',
        node,
        model,
        parent: container,
        start,
        end: this.line.end,
        fence: colons,
        fenceIndent: relIndent,
        lines: [],
      });
    }
    return 'done';
  }

  /** Parses `[label]{attrs}` after a block directive's name and reports trailing junk. */
  private parseDirectiveHeader(from: number, name: string, form: 'leaf' | 'container') {
    const text = this.text;
    const lineStart = this.line.start;
    let pos = from;
    let rawLabel: string | null = null;
    let labelRange: Range | null = null;
    let labelSegment: Segment | null = null;
    let attributes: Attributes | null = null;

    if (text[pos] === '[') {
      const close = findLabelEnd(text, pos);
      const labelEnd = close === -1 ? text.length : close;
      if (close === -1) {
        this.diagnostics.report(
          'MU1007',
          this.index.range(lineStart + pos, this.line.end),
          'Unterminated directive label: expected `]` on the same line.',
          {
            fixes: [
              {
                title: 'Insert ]',
                edits: [{ range: this.index.range(this.line.end, this.line.end), newText: ']' }],
              },
            ],
          },
        );
      }
      rawLabel = unescapeLabel(text.slice(pos + 1, labelEnd));
      labelRange = this.index.range(
        lineStart + pos,
        lineStart + Math.min(text.length, labelEnd + 1),
      );
      labelSegment = { text: text.slice(pos + 1, labelEnd), offset: lineStart + pos + 1 };
      pos = close === -1 ? text.length : close + 1;
    }
    if (text[pos] === '{') {
      const result = parseAttributes(text, pos, {
        index: this.index,
        diagnostics: this.diagnostics,
        toOffset: (i) => lineStart + i,
      });
      attributes = result.attributes;
      pos = result.end;
    }
    const end = pos;
    if (!isBlank(text, pos)) {
      let junkStart = pos;
      while (text[junkStart] === ' ' || text[junkStart] === '\t') junkStart++;
      const junk = text.slice(junkStart).trimEnd();
      const range = this.index.range(lineStart + junkStart, lineStart + junkStart + junk.length);
      const fixes: DiagnosticFix[] = [];
      let message = `Unexpected text after the ${form} directive \`${name}\`.`;
      if (
        rawLabel === null &&
        attributes === null &&
        !junk.startsWith('{') &&
        !junk.startsWith('[')
      ) {
        message += ` To give it a label, write \`${form === 'leaf' ? '::' : ':::'}${name}[${junk}]\`.`;
        fixes.push({
          title: `Use “${junk}” as the label`,
          edits: [
            {
              range: this.index.range(lineStart + from, lineStart + junkStart + junk.length),
              newText: `[${junk.replace(/[[\]\\]/g, '\\$&')}]`,
            },
          ],
          preferred: true,
        });
      } else if (junk.startsWith('[') && attributes !== null) {
        message += ' The label must come before the attributes: `name[label]{attrs}`.';
      }
      this.diagnostics.report('MU1005', range, message, { fixes });
    }
    return { rawLabel, labelRange, labelSegment, attributes, end };
  }

  /** Handles a line made only of colons. */
  private closingFence(container: OpenContainer, p: number, colons: number): 'done' | null {
    const lineStart = this.line.start;
    const fenceRange = this.index.range(lineStart + p, lineStart + p + colons);
    let effective: OpenContainer = container;
    while (effective.kind === 'list' && effective.parent) effective = effective.parent;

    if (effective.kind !== 'directive') {
      const open = findOpenDirective(effective);
      const related: RelatedInformation[] = open
        ? [{ range: open.node.openRange, message: `\`${open.node.name}\` is opened here.` }]
        : [];
      this.diagnostics.report(
        'MU1003',
        fenceRange,
        open
          ? `This fence is not at the nesting level of \`${open.node.name}\` (line ${open.node.position.start.line}). Close a directive inside the same list item or blockquote it was opened in.`
          : 'Closing fence without an open directive; it is shown as text.',
        { related },
      );
      return null; // Falls through to paragraph text.
    }

    // Candidates: the chain of directly nested directives, innermost first.
    const chain: OpenDirective[] = [];
    for (
      let block: OpenContainer | null = effective;
      block?.kind === 'directive';
      block = block.parent
    )
      chain.push(block);
    const innermost = chain[0]!;
    const target =
      chain.find((d) => d.fence === colons) ?? (innermost.fence <= colons ? innermost : null);
    if (!target) {
      this.diagnostics.report(
        'MU1004',
        fenceRange,
        `Closing fence \`${':'.repeat(colons)}\` is shorter than the opening fence of \`${innermost.node.name}\` (\`${':'.repeat(innermost.fence)}\`); it is shown as text.`,
        {
          related: [{ range: innermost.node.openRange, message: 'Opened here.' }],
          fixes: [
            {
              title: `Use ${':'.repeat(innermost.fence)}`,
              edits: [{ range: fenceRange, newText: ':'.repeat(innermost.fence) }],
              preferred: true,
            },
          ],
        },
      );
      return null;
    }
    this.closeUnmatched();
    target.node.closed = true;
    target.node.closeRange = fenceRange;
    target.end = lineStart + p + colons;
    const reason: CloseReason = { kind: 'fence', target, fence: fenceRange };
    while (this.tip !== target) this.close(this.tip, reason);
    this.close(target, NORMAL);
    return 'done';
  }

  private queueLabel(node: Directive, segment: Segment | null): void {
    if (segment) this.jobs.push({ kind: 'label', node, source: new SegmentText([segment]) });
  }

  // -------------------------------------------------------------------------
  // Leaf starts

  private startCode(
    container: OpenContainer,
    fenceChar: string,
    fenceLength: number,
    relIndent: number,
    p: number,
    info: string,
  ): void {
    const lineStart = this.line.start;
    const infoTrimmed = info.trim();
    let infoOffset = p + fenceLength + (info.length - info.trimStart().length);
    let lang: string | null = null;
    let meta: string | null = null;
    let attributes: Attributes | null = null;
    if (infoTrimmed.length > 0) {
      let rest = infoTrimmed;
      const langMatch = /^[^\s{]+/.exec(infoTrimmed);
      if (langMatch) {
        lang = unescapeLabel(langMatch[0]);
        rest = infoTrimmed.slice(langMatch[0].length);
        infoOffset += langMatch[0].length;
      }
      const restTrimmed = rest.trimStart();
      infoOffset += rest.length - restTrimmed.length;
      if (
        restTrimmed.startsWith('{') &&
        findAttributeBlockEnd(restTrimmed, 0) === restTrimmed.length - 1
      ) {
        attributes = parseAttributes(this.text, infoOffset, {
          index: this.index,
          diagnostics: this.diagnostics,
          toOffset: (i) => lineStart + i,
        }).attributes;
      } else if (restTrimmed.length > 0) {
        meta = restTrimmed;
      }
    }
    const node: Code = {
      type: 'code',
      lang,
      meta,
      attributes,
      value: '',
      closed: false,
      position: this.index.range(lineStart + p, this.line.end),
    };
    this.addLeaf(container, {
      kind: 'code',
      node,
      parent: container,
      start: lineStart + p,
      end: this.line.end,
      fenceChar,
      fenceLength,
      fenceIndent: relIndent,
      lines: [],
    });
  }

  private tryAtxHeading(p: number): Heading | null {
    const text = this.text;
    const level = countRun(text, p, '#');
    if (level > 6) return null;
    const after = text[p + level];
    if (after !== undefined && after !== ' ' && after !== '\t') return null;
    const lineStart = this.line.start;
    let contentStart = p + level;
    while (text[contentStart] === ' ' || text[contentStart] === '\t') contentStart++;
    let contentEnd = trimEndIndex(text, contentStart, text.length);

    // Trailing attribute block: `# Title {#id .class}`
    let attributes: Attributes | null = null;
    if (text[contentEnd - 1] === '}') {
      const open = text.lastIndexOf('{', contentEnd - 1);
      if (
        open >= contentStart &&
        (open === contentStart || text[open - 1] === ' ' || text[open - 1] === '\t') &&
        findAttributeBlockEnd(text, open, contentEnd) === contentEnd - 1 &&
        looksLikeAttributes(text, open)
      ) {
        attributes = parseAttributes(
          text,
          open,
          { index: this.index, diagnostics: this.diagnostics, toOffset: (i) => lineStart + i },
          contentEnd,
        ).attributes;
        contentEnd = trimEndIndex(text, contentStart, open);
      }
    }
    // Optional closing sequence of `#`, preceded by whitespace.
    let closeStart = contentEnd;
    while (closeStart > contentStart && text[closeStart - 1] === '#') closeStart--;
    if (
      closeStart < contentEnd &&
      (closeStart === contentStart || text[closeStart - 1] === ' ' || text[closeStart - 1] === '\t')
    ) {
      contentEnd = trimEndIndex(text, contentStart, closeStart);
    }
    const node: Heading = {
      type: 'heading',
      depth: level as HeadingDepth,
      style: 'atx',
      attributes,
      children: [],
      position: this.index.range(lineStart + p, this.line.end),
    };
    const segment = {
      text: text.slice(contentStart, contentEnd),
      offset: lineStart + contentStart,
    };
    this.jobs.push({ kind: 'content', node, source: new SegmentText([segment]), tableCell: false });
    return node;
  }

  private convertToSetext(paragraph: OpenParagraph, depth: 1 | 2): boolean {
    this.extractDefinitions(paragraph);
    if (paragraph.lines.length === 0) return false;
    const lines = trimLastSegment(paragraph.lines);
    const node: Heading = {
      type: 'heading',
      depth,
      style: 'setext',
      attributes: null,
      children: [],
      position: this.index.range(paragraph.start, this.line.end),
    };
    this.jobs.push({ kind: 'content', node, source: new SegmentText(lines), tableCell: false });
    this.discardLeaf(paragraph);
    this.addBlock(paragraph.parent, node);
    return true;
  }

  private tryTable(paragraph: OpenParagraph, p: number): boolean {
    const rowText = this.text.slice(p);
    const align = parseDelimiterRow(rowText);
    if (!align) return false;
    this.extractDefinitions(paragraph);
    const header = paragraph.lines[paragraph.lines.length - 1];
    // The paragraph may be empty once link reference definitions were extracted from it.
    if (!header) return false;
    if (!header.text.includes('|') && !rowText.includes('|')) return false;
    const headerCells = splitRow(header.text, header.offset);
    if (headerCells.length !== align.length) return false;

    // The header is the paragraph's last line; earlier lines remain a paragraph.
    paragraph.lines.pop();
    const parent = paragraph.parent;
    if (paragraph.lines.length > 0) this.close(paragraph, NORMAL);
    else this.discardLeaf(paragraph);

    const node: Table = {
      type: 'table',
      align,
      children: [],
      position: this.index.range(header.offset, this.line.end),
    };
    const table: OpenTable = {
      kind: 'table',
      node,
      parent,
      start: header.offset,
      end: this.line.end,
      columns: align.length,
    };
    node.children.push(
      this.makeRow(
        headerCells,
        true,
        header.offset,
        header.offset + header.text.length,
        align.length,
      ),
    );
    this.addLeaf(parent, table);
    return true;
  }

  private addTableRow(table: OpenTable): void {
    this.skipSpaces();
    const offset = this.line.start + this.pos;
    const cells = splitRow(this.text.slice(this.pos), offset);
    table.node.children.push(this.makeRow(cells, false, offset, this.line.end, table.columns));
    table.end = this.line.end;
    this.touch(table.parent);
  }

  private makeRow(
    cells: Segment[],
    head: boolean,
    start: number,
    end: number,
    columns: number,
  ): TableRow {
    if (cells.length > columns) {
      const extra = cells[columns]!;
      const last = cells[cells.length - 1]!;
      this.diagnostics.report(
        'MU1014',
        this.index.range(extra.offset, last.offset + last.text.length),
        `This row has ${cells.length} cells but the table has ${columns} column${columns === 1 ? '' : 's'}; the extra cells are dropped.`,
      );
    }
    const children: TableCell[] = [];
    for (let i = 0; i < columns; i++) {
      const cell = cells[i];
      const node: TableCell = {
        type: 'tableCell',
        children: [],
        position: cell
          ? this.index.range(cell.offset, cell.offset + cell.text.length)
          : this.index.range(end, end),
      };
      if (cell && cell.text.length > 0)
        this.jobs.push({ kind: 'content', node, source: new SegmentText([cell]), tableCell: true });
      children.push(node);
    }
    return { type: 'tableRow', head, children, position: this.index.range(start, end) };
  }

  private startListItem(
    container: OpenContainer,
    marker: ListMarker,
    p: number,
    base: number,
    markerColumn: number,
  ): OpenContainer {
    const lineStart = this.line.start;
    const markerWidth = marker.end - p;
    this.advanceTo(marker.end, markerColumn + markerWidth);
    const afterMarker = this.column;
    const ws = this.peekIndent();
    const spaces = ws.column - afterMarker;
    const relMarker = markerColumn - base;
    let contentIndent: number;
    if (ws.pos >= this.text.length) {
      contentIndent = relMarker + markerWidth + 1;
      this.advanceTo(ws.pos, ws.column);
    } else if (spaces >= 5) {
      contentIndent = relMarker + markerWidth + 1;
      this.advanceColumns(1);
    } else {
      contentIndent = relMarker + markerWidth + spaces;
      this.advanceTo(ws.pos, ws.column);
    }

    let checked: boolean | null = null;
    const task = /^\[([ xX])\](?=[ \t]|$)/.exec(this.text.slice(this.pos));
    if (task) {
      checked = task[1] !== ' ';
      this.advanceTo(this.pos + 3, this.column + 3);
      this.skipSpaces();
    }

    let list: OpenList;
    if (
      container.kind === 'list' &&
      container.bullet === marker.bullet &&
      container.delimiter === marker.delimiter
    ) {
      list = container;
      const blankBetweenItems = list.sawBlank;
      this.closeUnmatched();
      if (list.child) this.close(list.child, NORMAL);
      if (blankBetweenItems && list.node.children.length > 0) list.node.spread = true;
    } else {
      const node: List = {
        type: 'list',
        ordered: marker.ordered,
        start: marker.ordered ? marker.number : null,
        spread: false,
        children: [],
        position: this.index.range(lineStart + p, lineStart + p),
      };
      list = this.addContainer(container, {
        kind: 'list',
        node,
        parent: null,
        child: null,
        start: lineStart + p,
        end: this.line.end,
        depth: 0,
        sawBlank: false,
        bullet: marker.bullet,
        delimiter: marker.delimiter,
      });
    }
    const node: ListItem = {
      type: 'listItem',
      checked,
      spread: false,
      marker: this.text.slice(p, marker.end),
      children: [],
      position: this.index.range(lineStart + p, lineStart + p),
    };
    return this.addContainer(list, {
      kind: 'listItem',
      node,
      parent: null,
      child: null,
      start: lineStart + p,
      end: this.line.end,
      depth: 0,
      sawBlank: false,
      contentIndent,
    });
  }

  private startComment(container: OpenContainer, p: number, endMarker: number): void {
    const lineStart = this.line.start;
    const block: OpenComment = {
      kind: 'comment',
      parent: container,
      start: lineStart + p,
      end: this.line.end,
      lines: [],
      closed: false,
    };
    this.addLeaf(container, block);
    if (endMarker !== -1) {
      block.lines.push(this.text.slice(p + 4, endMarker));
      block.closed = true;
      block.end = lineStart + endMarker + 3;
      this.close(block, NORMAL);
    } else {
      block.lines.push(this.text.slice(p + 4));
    }
  }

  private startParagraph(container: OpenContainer): void {
    this.skipSpaces();
    const block: OpenParagraph = {
      kind: 'paragraph',
      parent: container,
      start: this.line.start + this.pos,
      end: this.line.end,
      lines: [],
    };
    this.addLeaf(container, block);
    this.addParagraphLine(block);
  }

  private addParagraphLine(block: OpenParagraph): void {
    this.skipSpaces();
    block.lines.push({ text: this.text.slice(this.pos), offset: this.line.start + this.pos });
    block.end = this.line.end;
    this.touch(block.parent);
  }

  private addRawLine(block: OpenCode | OpenRaw | OpenComment): void {
    const rest = this.text.slice(this.pos);
    if (block.kind === 'comment') {
      const end = rest.indexOf('-->');
      if (end === -1) {
        block.lines.push(rest);
        block.end = this.line.end;
        return;
      }
      block.lines.push(rest.slice(0, end));
      block.closed = true;
      const afterComment = this.line.start + this.pos + end + 3;
      block.end = afterComment;
      if (!isBlank(rest, end + 3)) {
        this.diagnostics.report(
          'MU1012',
          this.index.range(afterComment, this.line.end),
          'Text after `-->` on the closing line of a comment block is part of the comment and is not rendered. Move it to its own line.',
        );
      }
      this.close(block, NORMAL);
      return;
    }
    if (block.kind === 'code') block.lines.push(rest);
    else block.lines.push({ text: rest, offset: this.line.start + this.pos });
    if (!this.blank) {
      block.end = this.line.end;
      this.touch(block.parent);
    }
  }

  // -------------------------------------------------------------------------
  // Tree maintenance

  private addContainer<T extends OpenContainer>(parent: OpenContainer, block: T): T {
    const target = this.prepareParent(parent, block.kind === 'listItem');
    this.noteNewChild(target);
    block.parent = target;
    block.depth = target.depth + 1;
    target.child = block;
    this.tip = block;
    this.touch(target);
    return block;
  }

  private addLeaf(parent: OpenContainer, block: OpenLeaf): void {
    const target = this.prepareParent(parent, false);
    this.noteNewChild(target);
    block.parent = target;
    target.child = block;
    this.tip = block;
    this.touch(target);
  }

  /** Adds a node that is complete on its line (headings, breaks, leaf directives). */
  private addBlock(parent: OpenContainer, node: Block): void {
    const target = this.prepareParent(parent, false);
    this.noteNewChild(target);
    this.pushChild(target, node);
    this.touch(target);
  }

  /**
   * Makes `parent` ready to receive a new child: closes unmatched blocks and any
   * open child, and climbs out of lists for anything that is not a list item.
   */
  private prepareParent(parent: OpenContainer, isItem: boolean): OpenContainer {
    this.closeUnmatched();
    let target = parent;
    this.closeBelow(target, NORMAL);
    while (target.kind === 'list' && !isItem && target.parent) {
      const up: OpenContainer = target.parent;
      this.close(target, NORMAL);
      target = up;
    }
    return target;
  }

  /** A new child is about to be added: a blank line since the previous child makes an item loose. */
  private noteNewChild(target: OpenContainer): void {
    if (target.kind === 'listItem' && target.sawBlank && target.node.children.length > 0)
      target.node.spread = true;
  }

  /** Removes a leaf without producing a node (its content moved elsewhere). */
  private discardLeaf(leaf: OpenLeaf): void {
    if (leaf.parent.child === leaf) leaf.parent.child = null;
    if (this.tip === leaf) this.tip = leaf.parent;
  }

  private pushChild(container: OpenContainer, node: Block | ListItem): void {
    switch (container.kind) {
      case 'list':
        container.node.children.push(node as ListItem);
        return;
      case 'directive':
        if (container.node.body.kind === 'flow') container.node.body.children.push(node as Block);
        return;
      default:
        container.node.children.push(node as Block);
    }
  }

  /** Records that a content line reached this container and its ancestors. */
  private touch(container: OpenContainer): void {
    if (this.blank) return;
    for (let block: OpenContainer | null = container; block; block = block.parent) {
      block.sawBlank = false;
      if (block.end < this.line.end) block.end = this.line.end;
    }
  }

  /** Closes blocks that did not continue on this line. Runs at most once per line. */
  private closeUnmatched(): void {
    if (this.unmatchedClosed) return;
    this.unmatchedClosed = true;
    const deepest = this.matchedBlock;
    const first = isContainer(deepest) ? deepest.child : null;
    const reason: CloseReason = {
      kind: 'parent',
      parent: first && isContainer(first) ? first : this.matched,
    };
    this.closeBelow(deepest, reason);
  }

  /** Closes every open block below `block`, if it is the tip or one of its ancestors. */
  private closeBelow(block: OpenBlock, reason: CloseReason): void {
    let isAncestor = false;
    for (let b: OpenBlock | null = this.tip; b; b = b.parent) {
      if (b === block) {
        isAncestor = true;
        break;
      }
    }
    if (!isAncestor) return;
    while (this.tip !== block) this.close(this.tip, reason);
  }

  private checkDepth(container: OpenContainer, extra: number): boolean {
    if (container.depth + extra <= MAX_BLOCK_DEPTH) return true;
    if (this.depthReportedLine !== this.line.index) {
      this.depthReportedLine = this.line.index;
      this.diagnostics.report(
        'MU1015',
        this.index.range(this.line.start + this.pos, this.line.end),
        `Blocks are nested more than ${MAX_BLOCK_DEPTH} levels deep; the rest of this line is treated as text.`,
      );
    }
    return false;
  }

  /** Closes `block` (the tip) and attaches its node to its parent. */
  private close(block: OpenBlock, reason: CloseReason): void {
    const parent = block.parent;
    if (!parent) return;
    if (this.tip === block) this.tip = parent;
    if (parent.child === block) parent.child = null;
    switch (block.kind) {
      case 'paragraph':
        this.finishParagraph(block);
        return;
      case 'code':
        this.finishCode(block, reason);
        return;
      case 'raw':
        this.finishRaw(block, reason);
        return;
      case 'comment':
        this.finishComment(block);
        return;
      case 'table':
        block.node.position = this.index.range(block.start, block.end);
        this.pushChild(parent, block.node);
        return;
      default:
        this.finishContainer(block, reason);
    }
  }

  private finishParagraph(block: OpenParagraph): void {
    this.extractDefinitions(block);
    if (block.lines.length === 0) return;
    const lines = trimLastSegment(block.lines);
    const last = lines[lines.length - 1]!;
    const node: Paragraph = {
      type: 'paragraph',
      children: [],
      position: this.index.range(lines[0]!.offset, last.offset + last.text.length),
    };
    this.jobs.push({ kind: 'content', node, source: new SegmentText(lines), tableCell: false });
    this.pushChild(block.parent, node);
  }

  private onlyDefinitions(paragraph: OpenParagraph): boolean {
    this.extractDefinitions(paragraph);
    if (paragraph.lines.length > 0) return false;
    this.discardLeaf(paragraph);
    return true;
  }

  /** Pulls link reference definitions off the start of a paragraph. */
  private extractDefinitions(block: OpenParagraph): void {
    if (block.lines.length === 0 || !block.lines[0]!.text.startsWith('[')) return;
    const joined = new SegmentText(block.lines);
    let pos = 0;
    while (pos < joined.text.length) {
      const def = parseDefinition(joined.text, pos);
      if (!def) break;
      const endIndex = joined.text[def.end - 1] === '\n' ? def.end - 1 : def.end;
      const node: Definition = {
        type: 'definition',
        label: def.label,
        identifier: normalizeLabel(def.label),
        url: def.url,
        title: def.title,
        position: this.index.range(joined.toOffset(def.start), joined.toOffset(endIndex)),
      };
      const previous = this.definitions.get(node.identifier);
      if (previous) {
        this.diagnostics.report(
          'MU2024',
          node.position,
          `Link reference \`[${def.label}]\` is already defined; the first definition wins.`,
          {
            related: [{ range: previous.position, message: 'First defined here.' }],
          },
        );
      } else {
        this.definitions.set(node.identifier, node);
      }
      this.pushChild(block.parent, node);
      pos = def.end;
    }
    if (pos === 0) return;
    const consumed =
      pos >= joined.text.length ? block.lines.length : countNewlines(joined.text, pos);
    block.lines = block.lines.slice(consumed);
    if (block.lines.length > 0) block.start = block.lines[0]!.offset;
  }

  private finishCode(block: OpenCode, reason: CloseReason): void {
    const node = block.node;
    const lines = [...block.lines];
    if (!node.closed) while (lines.length > 0 && isBlank(lines[lines.length - 1]!)) lines.pop();
    node.value = lines.join('\n');
    node.position = this.index.range(block.start, block.end);
    if (!node.closed) {
      const fence = block.fenceChar.repeat(block.fenceLength);
      const where = reason.kind === 'eof' ? 'the end of the document' : 'the end of its container';
      this.diagnostics.report(
        'MU1011',
        this.index.range(block.start, block.start + block.fenceLength),
        `Code block is never closed; it runs to ${where}. Add a \`${fence}\` line after the code.`,
        {
          fixes: [
            {
              title: `Insert closing ${fence}`,
              edits: [{ range: this.index.range(block.end, block.end), newText: `\n${fence}` }],
              preferred: true,
            },
          ],
        },
      );
      if (reason.kind === 'eof') this.unclosedCodeAtEof = node;
    }
    this.pushChild(block.parent, node);
  }

  private finishRaw(block: OpenRaw, reason: CloseReason): void {
    const node = block.node;
    const lines = [...block.lines];
    while (lines.length > 0 && isBlank(lines[lines.length - 1]!.text)) lines.pop();
    const raw = lines.map((l) => l.text).join('\n');
    const first = lines[0];
    const last = lines[lines.length - 1];
    const bodyRange =
      first && last
        ? this.index.range(first.offset, last.offset + last.text.length)
        : this.index.range(node.openRange.end.offset, node.openRange.end.offset);
    node.body =
      block.model === 'data'
        ? {
            kind: 'data',
            value: parseData(lines, this.index, this.diagnostics),
            raw,
            range: bodyRange,
          }
        : { kind: 'raw', value: raw, range: bodyRange };
    node.position = this.index.range(block.start, Math.max(block.end, bodyRange.end.offset));
    if (!node.closed) this.reportUnclosed(node, block.fence, reason);
    this.pushChild(block.parent, node);
  }

  private finishComment(block: OpenComment): void {
    const node: Comment = {
      type: 'comment',
      value: block.lines.join('\n'),
      closed: block.closed,
      position: this.index.range(block.start, block.end),
    };
    if (!block.closed) {
      this.diagnostics.report(
        'MU1012',
        this.index.range(block.start, block.start + 4),
        'Comment is never closed with `-->`; everything after it is hidden.',
        {
          fixes: [
            {
              title: 'Insert -->',
              edits: [{ range: this.index.range(block.end, block.end), newText: ' -->' }],
              preferred: true,
            },
          ],
        },
      );
    }
    this.pushChild(block.parent, node);
  }

  private finishContainer(block: OpenContainer, reason: CloseReason): void {
    const parent = block.parent!;
    let end = block.end;
    const children: readonly { position: Range }[] =
      block.kind === 'directive'
        ? block.node.body.kind === 'flow'
          ? block.node.body.children
          : []
        : block.node.children;
    const lastChild = children[children.length - 1];
    if (lastChild && lastChild.position.end.offset > end) end = lastChild.position.end.offset;
    block.node.position = this.index.range(block.start, Math.max(block.start, end));

    switch (block.kind) {
      case 'directive':
        if (!block.node.closed) this.reportUnclosed(block.node, block.fence, reason);
        break;
      case 'list':
        if (!block.node.spread) block.node.spread = block.node.children.some((item) => item.spread);
        break;
      case 'footnote': {
        const previous = this.footnotes.get(block.node.identifier);
        if (previous) {
          this.diagnostics.report(
            'MU2024',
            this.index.range(block.start, block.start + block.node.label.length + 3),
            `Footnote \`[^${block.node.label}]\` is already defined; the first definition wins.`,
            { related: [{ range: previous.position, message: 'First defined here.' }] },
          );
        } else {
          this.footnotes.set(block.node.identifier, block.node);
        }
        break;
      }
      default:
        break;
    }
    this.pushChild(parent, block.node as Block | ListItem);
  }

  private reportUnclosed(node: ContainerDirective, fence: number, reason: CloseReason): void {
    const fenceText = ':'.repeat(fence);
    const insertAt = node.position.end.offset;
    const fix: DiagnosticFix = {
      title: `Insert closing ${fenceText}`,
      edits: [{ range: this.index.range(insertAt, insertAt), newText: `\n${fenceText}` }],
      preferred: true,
    };
    if (reason.kind === 'eof') {
      const related: RelatedInformation[] = [];
      const code = this.unclosedCodeAtEof;
      if (code && code.position.start.offset > node.position.start.offset) {
        related.push({
          range: code.position,
          message:
            'This code block is never closed, so it swallows the rest of the document — including any `:::`.',
        });
      }
      this.diagnostics.report(
        'MU1001',
        node.openRange,
        `Directive \`${node.name}\` is never closed. Add a \`${fenceText}\` line after its content.`,
        {
          related,
          fixes: [fix],
        },
      );
    } else if (reason.kind === 'fence') {
      this.diagnostics.report(
        'MU1002',
        node.openRange,
        `Directive \`${node.name}\` is not closed; the fence on line ${reason.fence.start.line} closes the enclosing \`${reason.target.node.name}\` and ends it too.`,
        {
          related: [{ range: reason.fence, message: `Closes \`${reason.target.node.name}\`.` }],
          fixes: [fix],
        },
      );
    } else {
      const what = reason.kind === 'parent' ? describeContainer(reason.parent) : 'its parent';
      this.diagnostics.report(
        'MU1002',
        node.openRange,
        `Directive \`${node.name}\` is not closed; it ends where ${what} ends.`,
        { fixes: [fix] },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Cursor helpers

  /** Is the rest of the line (from the cursor) blank? */
  private restBlank(): boolean {
    if (this.pos <= this.leadingEnd) return this.leadingEnd >= this.text.length;
    return isBlank(this.text, this.pos);
  }

  /** Looks ahead over spaces and tabs without consuming them. */
  private peekIndent(): { pos: number; column: number } {
    // Fast path: inside the line's leading whitespace the answer is always the same.
    if (this.pos <= this.leadingEnd) return { pos: this.leadingEnd, column: this.leadingEndColumn };
    let pos = this.pos;
    let column = this.column;
    while (pos < this.text.length) {
      const c = this.text.charCodeAt(pos);
      if (c === 0x20) column++;
      else if (c === 0x09) column += TAB_SIZE - (column % TAB_SIZE);
      else break;
      pos++;
    }
    return { pos, column };
  }

  private advanceTo(pos: number, column: number): void {
    this.pos = pos;
    this.column = column;
  }

  /** Consumes whitespace worth up to `columns` columns; a tab that overshoots is consumed whole. */
  private advanceColumns(columns: number): void {
    const target = this.column + columns;
    while (this.column < target && this.pos < this.text.length) {
      const c = this.text.charCodeAt(this.pos);
      if (c === 0x20) this.column++;
      else if (c === 0x09) this.column += TAB_SIZE - (this.column % TAB_SIZE);
      else break;
      this.pos++;
    }
  }

  private skipSpaces(): void {
    const indent = this.peekIndent();
    this.advanceTo(indent.pos, indent.column);
  }

  /** `>` followed by an optional space or tab. */
  private consumeBlockquoteMarker(): void {
    this.pos++;
    this.column++;
    const c = this.text.charCodeAt(this.pos);
    if (c === 0x20) {
      this.pos++;
      this.column++;
    } else if (c === 0x09) {
      this.pos++;
      this.column += TAB_SIZE - (this.column % TAB_SIZE);
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers

function findOpenDirective(from: OpenContainer | null): OpenDirective | null {
  for (let block = from; block; block = block.parent) if (block.kind === 'directive') return block;
  return null;
}

function describeContainer(block: OpenContainer): string {
  switch (block.kind) {
    case 'blockquote':
      return 'the enclosing blockquote';
    case 'listItem':
      return 'the enclosing list item';
    case 'list':
      return 'the enclosing list';
    case 'footnote':
      return 'the enclosing footnote';
    case 'directive':
      return `the enclosing \`${block.node.name}\``;
    case 'document':
      return 'the document';
  }
}

function countRun(text: string, pos: number, char: string): number {
  let n = 0;
  while (text[pos + n] === char) n++;
  return n;
}

function countNewlines(text: string, end: number): number {
  let n = 0;
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 0x0a) n++;
  return n;
}

function trimEndIndex(text: string, start: number, end: number): number {
  let e = end;
  while (e > start && (text[e - 1] === ' ' || text[e - 1] === '\t')) e--;
  return e;
}

function trimLastSegment(lines: readonly Segment[]): Segment[] {
  return lines.map((l, i) =>
    i === lines.length - 1 ? { text: l.text.trimEnd(), offset: l.offset } : l,
  );
}

function isThematicBreak(text: string, pos: number): boolean {
  const char = text[pos];
  let count = 0;
  for (let i = pos; i < text.length; i++) {
    const c = text[i];
    if (c === char) count++;
    else if (c !== ' ' && c !== '\t') return false;
  }
  return count >= 3;
}

interface ListMarker {
  ordered: boolean;
  bullet: string;
  delimiter: string | null;
  number: number;
  /** Index just past the marker. */
  end: number;
}

function parseListMarker(text: string, pos: number): ListMarker | null {
  const c = text[pos];
  if (c === '-' || c === '+' || c === '*') {
    const next = text[pos + 1];
    if (next !== undefined && next !== ' ' && next !== '\t') return null;
    return { ordered: false, bullet: c, delimiter: null, number: 0, end: pos + 1 };
  }
  const m = /^([0-9]{1,9})([.)])(?=[ \t]|$)/.exec(text.slice(pos, pos + 12));
  if (!m) return null;
  return {
    ordered: true,
    bullet: '',
    delimiter: m[2]!,
    number: parseInt(m[1]!, 10),
    end: pos + m[0].length,
  };
}

/** Parses a GFM delimiter row into column alignments. */
function parseDelimiterRow(text: string): TableAlign[] | null {
  const trimmed = text.trim();
  if (!/^\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?$/.test(trimmed)) return null;
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => {
    const t = cell.trim();
    const left = t.startsWith(':');
    const right = t.endsWith(':');
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
  });
}

/** Splits a table row on unescaped pipes; each cell keeps its source offset. */
function splitRow(text: string, offset: number): Segment[] {
  const cells: Segment[] = [];
  let start = 0;
  let end = text.length;
  while (start < end && (text[start] === ' ' || text[start] === '\t')) start++;
  while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) end--;
  if (text[start] === '|') start++;
  if (end > start && text[end - 1] === '|' && !isEscaped(text, end - 1)) end--;
  let cellStart = start;
  const push = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && (text[a] === ' ' || text[a] === '\t')) a++;
    while (b > a && (text[b - 1] === ' ' || text[b - 1] === '\t')) b--;
    cells.push({ text: text.slice(a, b), offset: offset + a });
  };
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '|') {
      push(cellStart, i);
      cellStart = i + 1;
    }
  }
  push(cellStart, end);
  return cells;
}

function isEscaped(text: string, pos: number): boolean {
  let backslashes = 0;
  for (let i = pos - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

/** Finds the `]` closing a directive label on one line (nested brackets, escapes and code spans honoured). */
function findLabelEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '`') {
      const run = countRun(text, i, '`');
      const close = text.indexOf('`'.repeat(run), i + run);
      i = (close === -1 ? i : close) + run - 1;
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

function unescapeLabel(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}
