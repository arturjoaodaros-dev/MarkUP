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

import { buildChart, chartSchema } from './chart';
import { buildCard, cardSchema } from './card';
import { buildAlert, alertSchema } from './alert';
import { buildProgress, progressSchema } from './progress';
import { buildMath, mathSchema } from './math';
import { buildCode, codeSchema } from './code';
import { buildTabs, tabsSchema } from './tabs';
import type { DirectiveSchema } from './types';

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

// Metadados por diretiva, indexados pelos mesmos nomes que `handlers` — a
// fonte de verdade para qualquer ferramenta externa (a extensão do VS Code,
// principalmente) que precise saber quais diretivas existem e quais
// atributos/valores cada uma aceita, sem duplicar essas listas.
export const directiveSchemas: Record<string, DirectiveSchema> = {
  chart: chartSchema,
  card: cardSchema,
  alert: alertSchema,
  progress: progressSchema,
  math: mathSchema,
  code: codeSchema,
  tabs: tabsSchema,
};

export function listDirectiveSchemas(): DirectiveSchema[] {
  return Object.values(directiveSchemas);
}

export function getDirectiveSchema(name: string): DirectiveSchema | undefined {
  return directiveSchemas[name];
}

export function getDirectiveNames(): string[] {
  return Object.keys(directiveSchemas);
}

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
