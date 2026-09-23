/**
 * The line scanner: the block-level lexer.
 *
 * MarkUP's block structure is line oriented, so the first lexical pass splits the
 * source into lines while keeping the exact source offset of every line. Nothing
 * is normalised in a way that would shift offsets: `\r\n` and `\r` terminators are
 * recognised in place, a leading byte-order mark is skipped (the first line simply
 * starts at offset 1) and U+0000 is replaced by U+FFFD, which has the same length.
 */

export interface SourceLine {
  /** 0-based line index. */
  index: number;
  /** Offset of the first character of the line (after a BOM on line 0). */
  start: number;
  /** Offset just past the last content character (before the terminator). */
  end: number;
  /** Line content without the terminator. */
  text: string;
  /** Length of the terminator: 0 (end of input), 1 (`\n`, `\r`) or 2 (`\r\n`). */
  eolLength: number;
}

const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

export function scanLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let index = 0;
  const length = source.length;
  let i = start;
  while (i <= length) {
    if (i === length) {
      // A trailing terminator does not produce an extra empty line.
      if (start < length || lines.length === 0) {
        lines.push(makeLine(source, index, start, length, 0));
      }
      break;
    }
    const c = source.charCodeAt(i);
    if (c === 0x0a || c === 0x0d) {
      const eol = c === 0x0d && source.charCodeAt(i + 1) === 0x0a ? 2 : 1;
      lines.push(makeLine(source, index++, start, i, eol));
      i += eol;
      start = i;
      continue;
    }
    i++;
  }
  return lines;
}

function makeLine(
  source: string,
  index: number,
  start: number,
  end: number,
  eolLength: number,
): SourceLine {
  let text = source.slice(start, end);
  if (text.includes('\0')) text = text.replace(/\0/g, REPLACEMENT_CHARACTER);
  return { index, start, end, text, eolLength };
}

/** Width of a tab stop when computing indentation columns. */
export const TAB_SIZE = 4;

/** Is the line empty or made only of spaces and tabs? */
export function isBlank(text: string, from = 0): boolean {
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 0x20 && c !== 0x09) return false;
  }
  return true;
}
