import type { Point, Position } from '../ast/nodes';

export interface Line {
  /** Texto da linha, sem o terminador. */
  text: string;
  /** Número da linha, 1-based. */
  number: number;
  /** Offset absoluto (na string original) do primeiro caractere da linha. */
  startOffset: number;
}

// Normaliza terminadores de linha e expande tabs (largura 4, comportamento
// mais previsível que 8 para documentos de texto). Divide em `Line[]`
// preservando o offset absoluto de cada uma, que é a base de toda posição
// reportada pelo parser.
export function scan(source: string): Line[] {
  const normalized = source.replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n');
  const lines: Line[] = [];
  let offset = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const text = expandTabs(rawLines[i]);
    lines.push({ text, number: i + 1, startOffset: offset });
    offset += rawLines[i].length + 1; // +1 pelo '\n' removido no split
  }
  return lines;
}

function expandTabs(text: string, tabWidth = 4): string {
  if (!text.includes('\t')) return text;
  let result = '';
  for (const ch of text) {
    if (ch === '\t') {
      const spaces = tabWidth - (result.length % tabWidth);
      result += ' '.repeat(spaces);
    } else {
      result += ch;
    }
  }
  return result;
}

export function pointAt(line: Line, column: number): Point {
  return { line: line.number, column, offset: line.startOffset + (column - 1) };
}

export function lineStartPoint(line: Line): Point {
  return pointAt(line, 1);
}

export function lineEndPoint(line: Line): Point {
  return pointAt(line, line.text.length + 1);
}

export function spanLines(first: Line, last: Line): Position {
  return { start: lineStartPoint(first), end: lineEndPoint(last) };
}

export function isBlank(line: Line): boolean {
  return line.text.trim().length === 0;
}
