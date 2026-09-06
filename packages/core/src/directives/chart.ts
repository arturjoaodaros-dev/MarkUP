import type { Chart, ChartType } from '../ast/nodes';
import { diagnostic } from '../diagnostics';
import { attrString } from '../parser/attributes';
import { parseDataBlockPrefix, parseNumericValue } from '../parser/dataBlock';
import { spanLines } from '../parser/scanner';
import type { DirectiveHandler } from './registry';
import type { DirectiveSchema } from './types';

export const VALID_TYPES: ChartType[] = ['bar', 'line', 'pie'];

export const chartSchema: DirectiveSchema = {
  name: 'chart',
  description: 'Gráfico de barras, linha ou pizza a partir de uma série "Rótulo: valor".',
  hasBody: true,
  bodyDescription: 'Uma linha por ponto: "Rótulo: valor" (aceita um "%" final, ignorado no cálculo).',
  attributes: [
    { name: 'type', description: 'Tipo do gráfico.', valueKind: 'enum', values: VALID_TYPES, default: 'bar' },
    { name: 'title', description: 'Título opcional exibido acima do gráfico.', valueKind: 'string' },
  ],
};

export const buildChart: DirectiveHandler = (attrs, input) => {
  const diagnostics = [];
  const rawType = attrString(attrs, 'type');
  let chartType: ChartType = 'bar';
  if (rawType !== undefined) {
    if ((VALID_TYPES as string[]).includes(rawType)) {
      chartType = rawType as ChartType;
    } else {
      diagnostics.push(
        diagnostic(
          'warning',
          'chart-invalid-type',
          `Tipo de grafico invalido "${rawType}"; usando "bar".`,
          input.position,
        ),
      );
    }
  }

  const { entries, consumed } = parseDataBlockPrefix(input.bodyLines);
  if (consumed < input.bodyLines.length) {
    const rest = input.bodyLines.slice(consumed);
    diagnostics.push(
      diagnostic(
        'warning',
        'chart-unrecognized-lines',
        'Linhas no corpo do grafico nao seguem o formato "Rotulo: valor" e foram ignoradas.',
        spanLines(rest[0], rest[rest.length - 1]),
      ),
    );
  }

  const series = entries
    .map((entry) => {
      const value = parseNumericValue(entry.rawValue);
      if (value === undefined) {
        diagnostics.push(
          diagnostic('warning', 'chart-invalid-value', `Valor numerico invalido para "${entry.label}": "${entry.rawValue}".`, spanLines(entry.line, entry.line)),
        );
        return null;
      }
      return { label: entry.label, value };
    })
    .filter((v): v is { label: string; value: number } => v !== null);

  const node: Chart = {
    type: 'chart',
    chartType,
    title: attrString(attrs, 'title'),
    series,
    position: input.position,
  };

  return { node, diagnostics };
};
