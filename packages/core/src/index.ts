/**
 * @markup-lang/core — the MarkUP language.
 *
 * ```ts
 * import { parse } from '@markup-lang/core';
 * const { document, diagnostics } = parse(':::note\nHello **world**\n:::');
 * ```
 */
export { parse, type ParseOptions, type ParseResult } from './parse.ts';
export * from './ast.ts';
export {
  DIAGNOSTIC_CODES,
  DiagnosticBag,
  hasErrors,
  sortDiagnostics,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticFix,
  type RelatedInformation,
  type ReportOptions,
  type Severity,
  type TextEdit,
} from './diagnostics.ts';
export { LineIndex, compareRanges, rangeContains, type Point, type Range } from './source/position.ts';
export { scanLines, type SourceLine } from './source/lines.ts';

export {
  DirectiveRegistry,
  defineDirective,
  labelSpec,
  type ContentModel,
  type DirectiveExample,
  type DirectiveSpec,
  type DirectiveValidationContext,
  type LabelSpec,
} from './directives/spec.ts';
export { BUILTIN_DIRECTIVES, CALLOUT_TYPES, CHART_TYPES, builtinRegistry, type CalloutType } from './directives/builtins.ts';
export { createRegistry, definePlugin, type MarkupPlugin } from './plugin.ts';

export {
  s,
  closest,
  coerceAttribute,
  describeNode,
  describeType,
  editDistance,
  isRequired,
  validateData,
  type AnySchema,
  type ArraySchema,
  type BooleanSchema,
  type Coerced,
  type DataIssue,
  type EnumSchema,
  type NumberSchema,
  type ObjectSchema,
  type RecordSchema,
  type Schema,
  type StringSchema,
  type UnionSchema,
} from './schema/schema.ts';

export { parseData, resolvePlain, type DataLine } from './data/parse.ts';
export {
  getEntry,
  toPlainData,
  type DataMap,
  type DataMapEntry,
  type DataNode,
  type DataScalar,
  type DataSeq,
  type PlainData,
  type ScalarStyle,
} from './data/types.ts';

export { parseAttributes, looksLikeAttributes } from './syntax/attributes.ts';
export { decodeEntities } from './syntax/entities.ts';
export { normalizeLabel } from './parser/links.ts';
export { MAX_BLOCK_DEPTH } from './parser/block.ts';
export { MAX_INLINE_DEPTH } from './parser/inline.ts';

export { isSafeUrl, validateDocument } from './validate.ts';
export { childrenOf, selectAll, visit, type VisitResult, type Visitor } from './util/visit.ts';
export { inlineText, textContent } from './util/text.ts';
export { collectAnchors, slugify, Slugger, type Anchor, type AnchorIndex } from './util/anchors.ts';
