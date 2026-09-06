import type { Alert, AlertLevel } from '../ast/nodes';
import { diagnostic } from '../diagnostics';
import { attrString } from '../parser/attributes';
import type { DirectiveHandler } from './registry';

const VALID_LEVELS: AlertLevel[] = ['info', 'success', 'warning', 'error'];

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
