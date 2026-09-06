import type { Card } from '../ast/nodes';
import { attrString } from '../parser/attributes';
import { parseDataBlockPrefix } from '../parser/dataBlock';
import type { DirectiveHandler } from './registry';
import type { DirectiveSchema } from './types';

export const cardSchema: DirectiveSchema = {
  name: 'card',
  description: 'Cartão com uma grade de métricas e, opcionalmente, conteúdo Markdown adicional.',
  hasBody: true,
  bodyDescription: 'Linhas iniciais "Rótulo: valor" viram métricas; o restante é Markdown normal.',
  attributes: [{ name: 'title', description: 'Título opcional exibido no topo do card.', valueKind: 'string' }],
};

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
