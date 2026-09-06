import type { MathBlock } from '../ast/nodes';
import type { DirectiveHandler } from './registry';

// O corpo é a expressão LaTeX bruta; a renderização (KaTeX, carregado sob
// demanda) acontece inteiramente no renderer, não aqui.
export const buildMath: DirectiveHandler = (_attrs, input) => {
  const node: MathBlock = {
    type: 'math',
    value: input.bodyLines.map((l) => l.text).join('\n').trim(),
    position: input.position,
  };
  return { node, diagnostics: [] };
};
