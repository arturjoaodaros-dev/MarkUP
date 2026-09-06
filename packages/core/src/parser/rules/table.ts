import type { ColumnAlign } from '../../ast/nodes';
import type { Line } from '../scanner';

const ROW_RE = /^\s*\|?(.*?)\|?\s*$/;
const DELIMITER_CELL_RE = /^:?-{1,}:?$/;

export function isTableDelimiterRow(line: Line): boolean {
  const cells = splitRow(line.text);
  return cells.length > 0 && cells.every((c) => DELIMITER_CELL_RE.test(c.trim()));
}

export function splitRow(text: string): string[] {
  const m = ROW_RE.exec(text);
  const inner = m ? m[1] : text;
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parseAlignRow(line: Line): ColumnAlign[] {
  return splitRow(line.text).map((cell) => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}
