import type { Alert, AlertLevel } from '../ast/nodes';
import { diagnostic } from '../diagnostics';
import { attrString } from '../parser/attributes';
import type { DirectiveHandler } from './registry';
import type { DirectiveSchema } from './types';

export const VALID_LEVELS: AlertLevel[] = ['info', 'success', 'warning', 'error'];

export const alertSchema: DirectiveSchema = {
  name: 'alert',
  description: 'Caixa de destaque para avisos, com quatro níveis de severidade.',
  hasBody: true,
  bodyDescription: 'Conteúdo em Markdown normal.',
  attributes: [
    { name: 'type', description: 'Nível do alerta.', valueKind: 'enum', values: VALID_LEVELS, default: 'info' },
    { name: 'title', description: 'Título opcional exibido em destaque.', valueKind: 'string' },
  ],
};

export const buildAlert: DirectiveHandler = (attrs, input, ctx) => {
  const diagnostics = [];
  const rawType = attrString(attrs, 'type');
  let level: AlertLevel = 'info';
  if (rawType !== undefined) {
    if ((VALID_LEVELS as string[]).includes(rawType)) {
      level = rawType as AlertLevel;
    } else {
      diagnostics.push(
        diagnostic('warning', 'alert-invalid-type', `Tipo de alerta invalido "${rawType}"; usando "info".`, input.position),
      );
    }
  }

  const node: Alert = {
    type: 'alert',
    level,
    title: attrString(attrs, 'title'),
    children: ctx.parseBlocks(input.bodyLines),
    position: input.position,
  };

  return { node, diagnostics };
};
