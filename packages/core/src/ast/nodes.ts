// AST do MarkUP.
//
// Toda posição é obrigatória: é o que alimenta o indicador de erros no editor
// e, mais tarde, a sincronia de rolagem entre editor e preview. O parser
// nunca lança exceção — documentos inválidos viram nós parciais com
// diagnósticos, nunca um crash.

export interface Point {
  line: number; // 1-based
  column: number; // 1-based
  offset: number; // 0-based, absoluto na string de origem
}

export interface Position {
  start: Point;
  end: Point;
}

interface NodeBase {
  type: string;
  position: Position;
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

export interface Text extends NodeBase {
  type: 'text';
  value: string;
}

export interface Strong extends NodeBase {
  type: 'strong';
  children: InlineNode[];
}

export interface Emphasis extends NodeBase {
  type: 'emphasis';
  children: InlineNode[];
}

export interface InlineCode extends NodeBase {
  type: 'inlineCode';
  value: string;
}

export interface Link extends NodeBase {
  type: 'link';
  url: string;
  title?: string;
  children: InlineNode[];
}

export interface Image extends NodeBase {
  type: 'image';
  url: string;
  alt: string;
  title?: string;
}

export interface Break extends NodeBase {
  type: 'break';
}

export type InlineNode = Text | Strong | Emphasis | InlineCode | Link | Image | Break;

// ---------------------------------------------------------------------------
// Blocos Markdown
// ---------------------------------------------------------------------------

export interface Heading extends NodeBase {
  type: 'heading';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

export interface Paragraph extends NodeBase {
  type: 'paragraph';
  children: InlineNode[];
}

export interface ListItem extends NodeBase {
  type: 'listItem';
  children: BlockNode[];
}

export interface List extends NodeBase {
  type: 'list';
  ordered: boolean;
  start?: number;
  items: ListItem[];
}

export interface Blockquote extends NodeBase {
  type: 'blockquote';
  children: BlockNode[];
}

export interface CodeBlock extends NodeBase {
  type: 'codeBlock';
  lang?: string;
  value: string;
}

export type ColumnAlign = 'left' | 'center' | 'right' | null;

export interface TableCell extends NodeBase {
  type: 'tableCell';
  children: InlineNode[];
}

export interface TableRow extends NodeBase {
  type: 'tableRow';
  cells: TableCell[];
}

export interface Table extends NodeBase {
  type: 'table';
  align: ColumnAlign[];
  header: TableRow;
  rows: TableRow[];
}

export interface ThematicBreak extends NodeBase {
  type: 'thematicBreak';
}

// ---------------------------------------------------------------------------
// Diretivas MarkUP — nós tipados, não genéricos
// ---------------------------------------------------------------------------

export type ChartType = 'bar' | 'line' | 'pie';

export interface ChartSeriesPoint {
  label: string;
  value: number;
}

export interface Chart extends NodeBase {
  type: 'chart';
  chartType: ChartType;
  title?: string;
  series: ChartSeriesPoint[];
}

export interface CardMetric {
  label: string;
  value: string;
}

export interface Card extends NodeBase {
  type: 'card';
  title?: string;
  metrics: CardMetric[];
  children: BlockNode[];
}

export type AlertLevel = 'info' | 'success' | 'warning' | 'error';

export interface Alert extends NodeBase {
  type: 'alert';
  level: AlertLevel;
  title?: string;
  children: BlockNode[];
}

export interface Progress extends NodeBase {
  type: 'progress';
  value: number;
  max: number;
  label?: string;
}

export interface MathBlock extends NodeBase {
  type: 'math';
  value: string;
}

export interface TabEntry {
  title: string;
  children: BlockNode[];
}

export interface Tabs extends NodeBase {
  type: 'tabs';
  tabs: TabEntry[];
}

// Diretiva reconhecida sintaticamente mas sem handler registrado, ou com
// atributos inválidos que impedem construir o nó tipado. Fica visível no
// preview com um aviso em vez de sumir ou quebrar o documento.
export interface UnknownDirective extends NodeBase {
  type: 'unknownDirective';
  name: string;
  raw: string;
}

export type DirectiveNode =
  | Chart
  | Card
  | Alert
  | Progress
  | MathBlock
  | Tabs
  | UnknownDirective;

export type BlockNode =
  | Heading
  | Paragraph
  | List
  | Blockquote
  | CodeBlock
  | Table
  | ThematicBreak
  | DirectiveNode;

export interface Document extends NodeBase {
  type: 'document';
  children: BlockNode[];
}

export type MarkupNode = Document | BlockNode | InlineNode | ListItem | TableRow | TableCell;
