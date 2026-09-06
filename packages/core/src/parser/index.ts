import type { Document } from '../ast/nodes';
import type { Diagnostic } from '../diagnostics';
import { parseBlocks } from './block';
import { scan } from './scanner';

export interface ParseResult {
  ast: Document;
  diagnostics: Diagnostic[];
}

/**
 * Ponto de entrada do parser. Nunca lança exceção: um documento inválido no
 * meio da digitação vira nós parciais mais diagnósticos, não um crash da
 * aplicação.
 */
export function parse(source: string): ParseResult {
  const lines = scan(source);
  const diagnostics: Diagnostic[] = [];
  const children = parseBlocks(lines, diagnostics);

  const first = lines[0];
  const last = lines[lines.length - 1] ?? first;
  const ast: Document = {
    type: 'document',
    children,
    position: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: last?.number ?? 1, column: (last?.text.length ?? 0) + 1, offset: source.length },
    },
  };

  return { ast, diagnostics };
}
