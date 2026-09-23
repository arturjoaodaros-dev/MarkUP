/**
 * Source positions.
 *
 * Every AST node, diagnostic and token produced by MarkUP carries a {@link Range}.
 * Lines and columns are 1-based; offsets are 0-based. Columns and offsets are
 * measured in UTF-16 code units — the same unit used by JavaScript strings, the
 * Language Server Protocol and CodeMirror — so editors can use them unchanged.
 */

export interface Point {
  /** 1-based line number. */
  line: number;
  /** 1-based column, in UTF-16 code units. */
  column: number;
  /** 0-based offset into the source string, in UTF-16 code units. */
  offset: number;
}

/** A half-open range: `start` is inclusive, `end` is exclusive. */
export interface Range {
  start: Point;
  end: Point;
}

/**
 * Maps offsets to line/column points and back.
 *
 * `\n`, `\r\n` and a lone `\r` are all treated as line terminators, matching the
 * line scanner.
 */
export class LineIndex {
  readonly text: string;
  /** Offset of the first character of every line. Always starts with 0. */
  readonly lineStarts: readonly number[];

  constructor(text: string) {
    this.text = text;
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 0x0a) {
        starts.push(i + 1);
      } else if (c === 0x0d) {
        if (text.charCodeAt(i + 1) === 0x0a) i++;
        starts.push(i + 1);
      }
    }
    this.lineStarts = starts;
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  /** Converts an offset (clamped to the text bounds) into a point. */
  pointAt(offset: number): Point {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    const starts = this.lineStarts;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= clamped) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: clamped - starts[lo]! + 1, offset: clamped };
  }

  /** Converts a 1-based line and column into an offset (clamped to the line). */
  offsetAt(line: number, column: number): number {
    const index = Math.max(0, Math.min(line - 1, this.lineStarts.length - 1));
    const start = this.lineStarts[index]!;
    const end = this.lineEnd(index + 1);
    return Math.max(start, Math.min(start + column - 1, end));
  }

  /** Offset just past the last content character of a 1-based line (before its terminator). */
  lineEnd(line: number): number {
    const index = line - 1;
    const next = this.lineStarts[index + 1];
    if (next === undefined) return this.text.length;
    let end = next;
    if (this.text.charCodeAt(end - 1) === 0x0a) end--;
    if (this.text.charCodeAt(end - 1) === 0x0d) end--;
    return end;
  }

  /** The text of a 1-based line, without its terminator. */
  lineText(line: number): string {
    const start = this.lineStarts[line - 1];
    if (start === undefined) return '';
    return this.text.slice(start, this.lineEnd(line));
  }

  range(start: number, end: number): Range {
    return { start: this.pointAt(start), end: this.pointAt(Math.max(start, end)) };
  }
}

export function rangeContains(range: Range, offset: number): boolean {
  return offset >= range.start.offset && offset <= range.end.offset;
}

export function compareRanges(a: Range, b: Range): number {
  return a.start.offset - b.start.offset || a.end.offset - b.end.offset;
}
