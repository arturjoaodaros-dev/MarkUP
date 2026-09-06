import { describe, expect, it } from 'vitest';
import { parse } from '../parser';
import { findNodeAtOffset, slugifyHeading } from '../ast/visit';
import { getDirectiveNames, getDirectiveSchema, listDirectiveSchemas } from '../directives/registry';
import { VALID_TYPES as CHART_TYPES } from '../directives/chart';
import { VALID_LEVELS as ALERT_LEVELS } from '../directives/alert';

// Estes testes existem para travar o mecanismo anti-duplicação: qualquer
// ferramenta externa (a extensão do VS Code) lê os valores válidos daqui,
// nunca de uma cópia própria. Se o schema um dia divergir da validação real
// (`buildChart`/`buildAlert`), é aqui que isso quebra.
describe('metadados de diretivas', () => {
  it('lista exatamente as sete diretivas registradas', () => {
    expect(getDirectiveNames().sort()).toEqual(
      ['alert', 'card', 'chart', 'code', 'math', 'progress', 'tabs'].sort(),
    );
  });

  it('o schema de chart expõe os mesmos tipos usados na validação', () => {
    const schema = getDirectiveSchema('chart');
    const typeAttr = schema?.attributes.find((a) => a.name === 'type');
    expect(typeAttr?.values).toBe(CHART_TYPES);
  });

  it('o schema de alert expõe os mesmos níveis usados na validação', () => {
    const schema = getDirectiveSchema('alert');
    const typeAttr = schema?.attributes.find((a) => a.name === 'type');
    expect(typeAttr?.values).toBe(ALERT_LEVELS);
  });

  it('progress é marcado como diretiva sem corpo', () => {
    expect(getDirectiveSchema('progress')?.hasBody).toBe(false);
  });

  it('listDirectiveSchemas devolve um schema por diretiva', () => {
    expect(listDirectiveSchemas()).toHaveLength(getDirectiveNames().length);
  });
});

describe('findNodeAtOffset', () => {
  it('encontra o nó mais interno (o texto), não só o bloco que o contém', () => {
    const source = ':::alert type="warning"\nPerigo.\n:::';
    const bodyOffset = source.indexOf('Perigo') + 2; // dentro do texto "Perigo."
    const { ast } = parse(source);
    const found = findNodeAtOffset(ast, bodyOffset);
    expect(found?.type).toBe('text');
  });

  it('encontra o bloco (alert) para um offset na linha de abertura da diretiva', () => {
    const source = ':::alert type="warning"\nPerigo.\n:::';
    const { ast } = parse(source);
    const found = findNodeAtOffset(ast, 5); // dentro de "alert" na linha de abertura
    expect(found?.type).toBe('alert');
  });

  it('devolve o document para um offset na linha em branco entre dois blocos', () => {
    const { ast } = parse('# Título\n\nTexto.');
    const blankLineOffset = 9; // fim de "# Título\n", início da linha em branco
    const found = findNodeAtOffset(ast, blankLineOffset);
    expect(found?.type).toBe('document');
  });

  it('devolve null para um offset além do documento', () => {
    const { ast } = parse('# Título');
    const found = findNodeAtOffset(ast, ast.position.end.offset + 100);
    expect(found).toBeNull();
  });
});

describe('slugifyHeading', () => {
  it('minúsculas, espaços viram hífen, pontuação é removida', () => {
    expect(slugifyHeading('As sete diretivas')).toBe('as-sete-diretivas');
    expect(slugifyHeading('`:::chart`')).toBe('chart');
    expect(slugifyHeading('Guia (completo)!')).toBe('guia-completo');
  });

  it('preserva acentos (mesmo comportamento do GitHub)', () => {
    expect(slugifyHeading('Sintaxe geral de diretivas')).toBe('sintaxe-geral-de-diretivas');
    expect(slugifyHeading('Exportação')).toBe('exportação');
  });

  it('desambigua headings repetidos com -1, -2, ao reaproveitar o mesmo Map', () => {
    const seen = new Map<string, number>();
    expect(slugifyHeading('Exemplo', seen)).toBe('exemplo');
    expect(slugifyHeading('Exemplo', seen)).toBe('exemplo-1');
    expect(slugifyHeading('Exemplo', seen)).toBe('exemplo-2');
  });

  it('sem Map, sempre devolve o slug base (sem desambiguação)', () => {
    expect(slugifyHeading('Exemplo')).toBe('exemplo');
    expect(slugifyHeading('Exemplo')).toBe('exemplo');
  });
});
