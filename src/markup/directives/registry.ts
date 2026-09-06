// Registro de diretivas: mapeia o nome reconhecido pelo parser
// (":::nome") para um handler que valida atributos e corpo, e produz o nó
// tipado correspondente. Adicionar uma diretiva nova é criar um arquivo
// como os deste diretório e registrá-lo aqui — o parser de blocos
// (`../parser/block.ts`) não muda.

import type { BlockNode, Position } from '../ast/nodes';
import type { Attributes } from '../parser/attributes';
import { parseAttributes } from '../parser/attributes';
import type { Diagnostic } from '../diagnostics';
import { diagnostic } from '../diagnostics';
import type { Line } from '../parser/scanner';

import { buildChart } from './chart';
import { buildCard } from './card';
import { buildAlert } from './alert';
import { buildProgress } from './progress';
import { buildMath } from './math';
import { buildCode } from './code';
import { buildTabs } from './tabs';

export interface DirectiveInput {
  name: string;
  attrsRaw: string;
  bodyLines: Line[];
  position: Position;
  fenceLength: number;
}

export interface DirectiveContext {
  /** Reentrada no parser de blocos, para diretivas com corpo Markdown (card, alert, tabs). */
  parseBlocks: (lines: Line[]) => BlockNode[];
}

export interface DirectiveResult {
  // A maioria das diretivas produz um nó de diretiva tipado, mas ":::code"
  // é normalizada para um `codeBlock` comum — é a mesma coisa com sintaxe
  // diferente, então não merece um nó novo nem tratamento especial no
  // renderer.
  node: BlockNode;
  diagnostics: Diagnostic[];
}

export type DirectiveHandler = (
  attrs: Attributes,
  input: DirectiveInput,
  ctx: DirectiveContext,
) => DirectiveResult;

const handlers: Record<string, DirectiveHandler> = {
  chart: buildChart,
  card: buildCard,
  alert: buildAlert,
  progress: buildProgress,
  math: buildMath,
  code: buildCode,
  tabs: buildTabs,
};

export function parseDirective(
  input: DirectiveInput,
  ctx: DirectiveContext,
  diagnostics: Diagnostic[],
): BlockNode {
  const attrs = parseAttributes(input.attrsRaw);
  const handler = handlers[input.name];

  if (!handler) {
    diagnostics.push(
      diagnostic('warning', 'directive-unknown', `Diretiva desconhecida: ":::${input.name}".`, input.position),
    );
    return {
      type: 'unknownDirective',
      name: input.name,
      raw: input.bodyLines.map((l) => l.text).join('\n'),
      position: input.position,
    };
  }

  const result = handler(attrs, input, ctx);
  diagnostics.push(...result.diagnostics);
  return result.node;
}
