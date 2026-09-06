import type { Card } from '../ast/nodes';
import { attrString } from '../parser/attributes';
import { parseDataBlockPrefix } from '../parser/dataBlock';
import type { DirectiveHandler } from './registry';

// O corpo do card começa, opcionalmente, com uma sequência de linhas
// "Rótulo: valor" que vira a grade de métricas; o restante do corpo é
// Markdown normal (parágrafos, listas, o que fizer sentido dentro do card).
export const buildCard: DirectiveHandler = (attrs, input, ctx) => {
  const { entries, consumed } = parseDataBlockPrefix(input.bodyLines);
  const metrics = entries.map((e) => ({ label: e.label, value: e.rawValue }));
  const restLines = input.bodyLines.slice(consumed);

  const node: Card = {
    type: 'card',
    title: attrString(attrs, 'title'),
    metrics,
    children: ctx.parseBlocks(restLines),
    position: input.position,
  };

  return { node, diagnostics: [] };
};
