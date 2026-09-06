import { describe, expect, it } from 'vitest';
import { toZeroBasedRange } from '../diagnostics/rangeMath';

describe('toZeroBasedRange', () => {
  it('converte linha/coluna 1-based do core para 0-based do VS Code', () => {
    const range = toZeroBasedRange({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 5, offset: 4 },
    });
    expect(range).toEqual({ start: { line: 0, column: 0 }, end: { line: 0, column: 4 } });
  });

  it('não inverte a subtração em nenhum dos dois pontos', () => {
    const range = toZeroBasedRange({
      start: { line: 3, column: 2, offset: 10 },
      end: { line: 5, column: 8, offset: 40 },
    });
    expect(range.start).toEqual({ line: 2, column: 1 });
    expect(range.end).toEqual({ line: 4, column: 7 });
  });
});
