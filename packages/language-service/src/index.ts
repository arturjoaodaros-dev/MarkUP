export { Analysis, LanguageService, type LanguageServiceOptions } from './analysis.ts';
export {
  getCompletions,
  snippetFor,
  type CompletionItem,
  type CompletionKind,
  type CompletionResult,
} from './completion.ts';
export { getHover, type Hover } from './hover.ts';
export {
  getFoldingRanges,
  getSymbols,
  type DocumentSymbol,
  type FoldingRange,
} from './structure.ts';
export {
  encodeSemanticTokens,
  getHighlights,
  getSemanticTokens,
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  type Highlight,
  type HighlightKind,
  type SemanticToken,
} from './highlight.ts';
export {
  getCodeActions,
  getDefinition,
  getDocumentLinks,
  getReferences,
  type CodeAction,
  type DocumentLink,
  type Location,
} from './navigation.ts';
export { attributeDocs, directiveDocs } from './docs.ts';
export { componentReference } from './reference.ts';
