import type { Point, Position } from '../ast/nodes';

export interface Line {
  /** Texto da linha, sem o terminador. */
  text: string;
  /** Número da linha, 1-based. */
  number: number;
  /** Offset absoluto (na string original) do primeiro caractere da linha. */
  startOffset: number;
}

// Normaliza terminadores de linha e divide em `Line[]`, preservando o
// offset absoluto de cada uma — a base de toda posição reportada pelo
// parser, e o que permite ao editor (`document.offsetAt`/`positionAt`)
// mapear essas posições de volta para o texto real sem tradução nenhuma.
//
// Deliberadamente NÃO expandimos tabs para espaços aqui: fazer isso mudaria
// o comprimento da linha em relação ao texto original, e qualquer offset
// calculado a partir da versão expandida deixaria de apontar para o
// caractere certo na string real (um bug sutil que existia antes desta
// versão). Um tab dentro de uma linha simplesmente não casa com os `\s`/`
// '.repeat(n)'` usados para detectar indentação de listas — é uma limitação
// aceita, documentada no SPEC, não um comportamento incorreto silencioso.
export function scan(source: string): Line[] {
  const normalized = source.replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n');
  const lines: Line[] = [];
  let offset = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const text = rawLines[i];
    lines.push({ text, number: i + 1, startOffset: offset });
    offset += text.length + 1; // +1 pelo '\n' removido no split
  }
  return lines;
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
