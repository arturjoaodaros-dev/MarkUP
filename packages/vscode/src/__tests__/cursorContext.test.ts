import { describe, expect, it } from 'vitest';
import { detectAttributePosition, isDirectiveNamePosition } from '../completion/cursorContext';

describe('isDirectiveNamePosition', () => {
  it('reconhece logo após ":::"', () => {
    expect(isDirectiveNamePosition(':::')).toBe(true);
  });

  it('reconhece com nome parcial em digitação', () => {
    expect(isDirectiveNamePosition('::::cha')).toBe(true);
  });

  it('não reconhece fora do início da diretiva', () => {
    expect(isDirectiveNamePosition('texto normal')).toBe(false);
  });
});

describe('detectAttributePosition', () => {
  it('detecta o nome da diretiva quando o cursor está na área de atributos', () => {
    const line = ':::chart type="bar" ';
    const ctx = detectAttributePosition(line, line.length);
    expect(ctx).toEqual({ directiveName: 'chart' });
  });

  it('detecta que o cursor está dentro do valor de um atributo aberto', () => {
    const line = ':::chart type="ba';
    const ctx = detectAttributePosition(line, line.length);
    expect(ctx).toEqual({ directiveName: 'chart', insideValueOf: 'type' });
  });

  it('retorna null quando o cursor ainda está sobre o nome da diretiva', () => {
    const line = ':::cha';
    expect(detectAttributePosition(line, 4)).toBeNull();
  });

  it('retorna null fora de uma linha de abertura de diretiva', () => {
    expect(detectAttributePosition('um parágrafo qualquer', 5)).toBeNull();
  });
});
