import type { CodeBlock } from '../ast/nodes';
import { attrString } from '../parser/attributes';
import type { DirectiveHandler } from './registry';
import type { DirectiveSchema } from './types';

export const codeSchema: DirectiveSchema = {
  name: 'code',
  description: 'Bloco de código, equivalente a uma cerca de código com linguagem.',
  hasBody: true,
  bodyDescription: 'Código-fonte, sem processamento.',
  attributes: [
    { name: 'language', description: 'Linguagem para realce de sintaxe (ex.: "python").', valueKind: 'string' },
  ],
};

// ":::code language="python"" é normalizada para um `codeBlock` comum: é a
// mesma coisa que uma cerca de código com sintaxe de diretiva, então não
// ganha um nó nem um componente próprios.
export const buildCode: DirectiveHandler = (attrs, input) => {
  const node: CodeBlock = {
    type: 'codeBlock',
    lang: attrString(attrs, 'language'),
    value: input.bodyLines.map((l) => l.text).join('\n'),
    position: input.position,
  };
  return { node, diagnostics: [] };
};
