import type { Point, Position } from './nodes';

export function point(line: number, column: number, offset: number): Point {
  return { line, column, offset };
}

export function position(start: Point, end: Point): Position {
  return { start, end };
}

// Posição "zero", usada para nós sintéticos que não correspondem a nenhum
// intervalo real do código-fonte (ex.: um fallback inserido pelo parser).
export function emptyPosition(): Position {
  const p = point(1, 1, 0);
  return { start: p, end: p };
}
