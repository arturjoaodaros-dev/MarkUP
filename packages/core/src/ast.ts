/**
 * The MarkUP abstract syntax tree.
 *
 * The AST is plain data: JSON-serialisable, renderer-agnostic and fully
 * positioned. Renderers, editors and tools consume it; nothing in it refers to
 * HTML. Node names follow the conventions of mdast where the concepts overlap so
 * that the tree feels familiar to people who know the unified ecosystem.
 */
import type { DataNode } from './data/types.ts';
import type { Range } from './source/position.ts';

export interface NodeBase {
  type: string;
  position: Range;
}

// ---------------------------------------------------------------------------
// Attributes

export type AttributeKind = 'id' | 'class' | 'pair' | 'flag';

export interface Attribute {
  kind: AttributeKind;
  /** `id` for `#x`, `class` for `.x`, otherwise the key. */
  name: string;
  /** The (unescaped) value; `true` for bare flags. */
  value: string | true;
  /** Range of the whole item, e.g. `key="value"`. */
  range: Range;
  /** Range of the key (pairs and flags only). */
  nameRange: Range | null;
  /** Range of the value, including quotes when quoted. */
  valueRange: Range | null;
}

export interface Attributes {
  /** The last `#id`, if any. */
  id: string | null;
  /** All `.class` items, in order. */
  classes: string[];
  /** Key/value pairs and flags (not ids or classes). A null-prototype object; the last value of a key wins. */
  values: Record<string, string | true>;
  /** Every item as written, in source order (including duplicates). */
  items: Attribute[];
  /** Range of the attribute block, braces included. */
  range: Range;
}

// ---------------------------------------------------------------------------
// Document and blocks

export interface Document extends NodeBase {
  type: 'document';
  frontMatter: FrontMatter | null;
  children: Block[];
}

export interface FrontMatter extends NodeBase {
  type: 'frontMatter';
  /** Parsed data, or `null` when empty or unparseable. */
  value: DataNode | null;
  /** The text between the fences. */
  raw: string;
}

export interface Paragraph extends NodeBase {
  type: 'paragraph';
  children: Inline[];
}

export type HeadingDepth = 1 | 2 | 3 | 4 | 5 | 6;

export interface Heading extends NodeBase {
  type: 'heading';
  depth: HeadingDepth;
  style: 'atx' | 'setext';
  attributes: Attributes | null;
  children: Inline[];
}

export interface ThematicBreak extends NodeBase {
  type: 'thematicBreak';
}

export interface Blockquote extends NodeBase {
  type: 'blockquote';
  children: Block[];
}

export interface List extends NodeBase {
  type: 'list';
  ordered: boolean;
  /** First number of an ordered list. */
  start: number | null;
  /** Loose list: items are separated by blank lines. */
  spread: boolean;
  children: ListItem[];
}

export interface ListItem extends NodeBase {
  type: 'listItem';
  /** `- [ ]` → false, `- [x]` → true, plain item → null. */
  checked: boolean | null;
  spread: boolean;
  /** The marker as written: `-`, `*`, `+`, `1.`, `3)`… */
  marker: string;
  children: Block[];
}

export interface Code extends NodeBase {
  type: 'code';
  /** First word of the info string. */
  lang: string | null;
  /** Rest of the info string, if it is not an attribute block. */
  meta: string | null;
  /** `{...}` attribute block in the info string. */
  attributes: Attributes | null;
  value: string;
  /** False when the block ran to the end of its container without a closing fence. */
  closed: boolean;
}

export type TableAlign = 'left' | 'center' | 'right' | null;

export interface Table extends NodeBase {
  type: 'table';
  align: TableAlign[];
  children: TableRow[];
}

export interface TableRow extends NodeBase {
  type: 'tableRow';
  head: boolean;
  children: TableCell[];
}

export interface TableCell extends NodeBase {
  type: 'tableCell';
  children: Inline[];
}

/** `<!-- ... -->`. Used both as a block and inline; renderers drop it. */
export interface Comment extends NodeBase {
  type: 'comment';
  value: string;
  closed: boolean;
}

/** Link reference definition: `[label]: url "title"`. */
export interface Definition extends NodeBase {
  type: 'definition';
  label: string;
  /** Normalised label used for matching. */
  identifier: string;
  url: string;
  title: string | null;
}

export interface FootnoteDefinition extends NodeBase {
  type: 'footnoteDefinition';
  label: string;
  identifier: string;
  children: Block[];
}

export interface FlowBody {
  kind: 'flow';
  children: Block[];
}

export interface DataBody {
  kind: 'data';
  value: DataNode | null;
  raw: string;
  range: Range;
}

export interface RawBody {
  kind: 'raw';
  value: string;
  range: Range;
}

export type DirectiveBody = FlowBody | DataBody | RawBody;

interface DirectiveBase extends NodeBase {
  name: string;
  nameRange: Range;
  /** Parsed label content, or null when there is no `[label]`. */
  label: Inline[] | null;
  /** The label text with backslash escapes resolved, or null. */
  rawLabel: string | null;
  labelRange: Range | null;
  attributes: Attributes | null;
}

/** `:::name[label]{attrs}` … `:::` */
export interface ContainerDirective extends DirectiveBase {
  type: 'containerDirective';
  /** Number of colons in the opening fence. */
  fence: number;
  body: DirectiveBody;
  /** False when the directive was closed implicitly (see MU1001/MU1002). */
  closed: boolean;
  /** Range of the opening fence line. */
  openRange: Range;
  /** Range of the closing fence, when present. */
  closeRange: Range | null;
}

/** `::name[label]{attrs}` on a line of its own. */
export interface LeafDirective extends DirectiveBase {
  type: 'leafDirective';
}

// ---------------------------------------------------------------------------
// Inlines

export interface Text extends NodeBase {
  type: 'text';
  value: string;
}

export interface Emphasis extends NodeBase {
  type: 'emphasis';
  children: Inline[];
}

export interface Strong extends NodeBase {
  type: 'strong';
  children: Inline[];
}

export interface Delete extends NodeBase {
  type: 'delete';
  children: Inline[];
}

export interface InlineCode extends NodeBase {
  type: 'inlineCode';
  value: string;
}

/** Hard line break. Soft breaks are `\n` inside text. */
export interface Break extends NodeBase {
  type: 'break';
}

export type LinkKind = 'inline' | 'reference' | 'autolink' | 'bare';

export interface Link extends NodeBase {
  type: 'link';
  kind: LinkKind;
  url: string;
  title: string | null;
  children: Inline[];
}

export interface Image extends NodeBase {
  type: 'image';
  url: string;
  title: string | null;
  /** Plain-text alternative, computed from the bracketed content. */
  alt: string;
  attributes: Attributes | null;
}

/** `:name[label]{attrs}` */
export interface InlineDirective extends DirectiveBase {
  type: 'inlineDirective';
}

export interface FootnoteReference extends NodeBase {
  type: 'footnoteReference';
  label: string;
  identifier: string;
}

// ---------------------------------------------------------------------------
// Unions

export type Block =
  | Paragraph
  | Heading
  | ThematicBreak
  | Blockquote
  | List
  | Code
  | Table
  | Comment
  | Definition
  | FootnoteDefinition
  | ContainerDirective
  | LeafDirective;

export type Inline =
  | Text
  | Emphasis
  | Strong
  | Delete
  | InlineCode
  | Break
  | Link
  | Image
  | InlineDirective
  | FootnoteReference
  | Comment;

export type Directive = ContainerDirective | LeafDirective | InlineDirective;

export type Node = Document | FrontMatter | Block | ListItem | TableRow | TableCell | Inline;

export type NodeType = Node['type'];

export type NodeOfType<T extends NodeType> = Extract<Node, { type: T }>;

export function isDirective(node: Node): node is Directive {
  return (
    node.type === 'containerDirective' ||
    node.type === 'leafDirective' ||
    node.type === 'inlineDirective'
  );
}

/** The syntactic form of a directive node. */
export type DirectiveForm = 'container' | 'leaf' | 'inline';

export function directiveForm(node: Directive): DirectiveForm {
  switch (node.type) {
    case 'containerDirective':
      return 'container';
    case 'leafDirective':
      return 'leaf';
    case 'inlineDirective':
      return 'inline';
  }
}
