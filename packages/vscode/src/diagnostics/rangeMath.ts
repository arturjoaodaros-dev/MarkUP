// Aritmética pura de conversão de posição — deliberadamente em um módulo
// próprio, sem NENHUM import de `vscode`. `vscode` só existe dentro do host
// real da extensão; qualquer arquivo que o importe, mesmo que não use o
// import no teste em questão, quebra ao rodar sob Vitest comum. Manter essa
// aritmética isolada é o que permite testá-la sem mock nenhum.

import type { Position } from '@markup/core';

export interface ZeroBasedRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export function toZeroBasedRange(pos: Position): ZeroBasedRange {
  return {
    start: { line: pos.start.line - 1, column: pos.start.column - 1 },
    end: { line: pos.end.line - 1, column: pos.end.column - 1 },
  };
}
