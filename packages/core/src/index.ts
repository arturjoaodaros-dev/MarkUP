// Ponto de entrada público do @markup/core. Todo consumidor externo (o app
// web, a extensão do VS Code) importa daqui, nunca de um caminho interno —
// isso é o que permite reorganizar o núcleo sem quebrar quem o usa.

export { parse } from './parser';
export type { ParseResult } from './parser';
export * from './ast/nodes';
export {
  visit,
  collectHeadings,
  isBlockContainer,
  findNodeAtOffset,
  inlineText,
  slugifyHeading,
} from './ast/visit';
export type { Diagnostic, DiagnosticSeverity } from './diagnostics';
export { matchDirectiveOpen, matchDirectiveClose } from './parser/directive';
export { parseAttributes, attrString, attrNumber } from './parser/attributes';
export type { Attributes, AttributeValue } from './parser/attributes';
export {
  directiveSchemas,
  listDirectiveSchemas,
  getDirectiveSchema,
  getDirectiveNames,
} from './directives/registry';
export type { DirectiveSchema, AttributeSchema } from './directives/types';
