import type { CodeBlock } from '../ast/nodes';
import { attrString } from '../parser/attributes';
import type { DirectiveHandler } from './registry';

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
