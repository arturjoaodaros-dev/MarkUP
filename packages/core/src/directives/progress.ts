import type { Progress } from '../ast/nodes';
import { diagnostic } from '../diagnostics';
import { attrNumber, attrString } from '../parser/attributes';
import type { DirectiveHandler } from './registry';
import type { DirectiveSchema } from './types';

export const progressSchema: DirectiveSchema = {
  name: 'progress',
  description: 'Barra de progresso de linha única.',
  hasBody: false,
  attributes: [
    { name: 'value', description: 'Valor atual.', valueKind: 'number', required: true },
    { name: 'max', description: 'Valor máximo.', valueKind: 'number', default: 100 },
    { name: 'label', description: 'Rótulo opcional exibido acima da barra.', valueKind: 'string' },
  ],
};

// :::progress value="72" label="Python" — forma de linha única, sem corpo.
export const buildProgress: DirectiveHandler = (attrs, input) => {
  const diagnostics = [];
  let value = attrNumber(attrs, 'value');
  if (value === undefined) {
    diagnostics.push(diagnostic('error', 'progress-missing-value', 'Diretiva ":::progress" precisa do atributo "value".', input.position));
    value = 0;
  }
  const max = attrNumber(attrs, 'max') ?? 100;
  const clamped = Math.min(Math.max(value, 0), max);
  if (clamped !== value) {
    diagnostics.push(
      diagnostic('warning', 'progress-value-clamped', `Valor ${value} fora do intervalo [0, ${max}]; ajustado para ${clamped}.`, input.position),
    );
  }

  const node: Progress = {
    type: 'progress',
    value: clamped,
    max,
    label: attrString(attrs, 'label'),
    position: input.position,
  };

  return { node, diagnostics };
};
