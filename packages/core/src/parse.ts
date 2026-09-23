import type { Document } from './ast.ts';
import { DiagnosticBag, sortDiagnostics, type Diagnostic } from './diagnostics.ts';
import type { DirectiveRegistry } from './directives/spec.ts';
import { parseBlocks } from './parser/block.ts';
import { parseInlines } from './parser/inline.ts';
import { createRegistry, type MarkupPlugin } from './plugin.ts';
import { LineIndex } from './source/position.ts';
import { validateDocument } from './validate.ts';

export interface ParseOptions {
  /** Directive registry. Defaults to the built-ins extended with `plugins`. */
  registry?: DirectiveRegistry;
  plugins?: readonly MarkupPlugin[];
  /** Run semantic validation (MU2xxx diagnostics). Defaults to true. */
  validate?: boolean;
}

export interface ParseResult {
  document: Document;
  /** Syntax and validation diagnostics, sorted by position. */
  diagnostics: Diagnostic[];
  lineIndex: LineIndex;
  registry: DirectiveRegistry;
}

/**
 * Parses a MarkUP document. Never throws for any input string: problems are
 * reported as diagnostics and the tree is always complete.
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const registry = options.registry ?? createRegistry(options.plugins ?? []);
  const lineIndex = new LineIndex(source);
  const diagnostics = new DiagnosticBag();

  const blocks = parseBlocks(source, lineIndex, diagnostics, registry);
  const ctx = { index: lineIndex, diagnostics, registry, definitions: blocks.definitions };
  for (const job of blocks.jobs) {
    if (job.kind === 'content') {
      job.node.children = parseInlines(job.source, ctx, { tableCell: job.tableCell });
    } else if (registry.labelModel(job.node.name) === 'raw') {
      const text = job.source.text;
      job.node.label = text.length
        ? [{ type: 'text', value: job.node.rawLabel ?? text, position: lineIndex.range(job.source.toOffset(0), job.source.endOffset()) }]
        : [];
    } else {
      job.node.label = parseInlines(job.source, ctx, { depth: 1 });
    }
  }

  if (options.validate !== false) validateDocument(blocks.document, registry, diagnostics);
  return { document: blocks.document, diagnostics: sortDiagnostics(diagnostics.items), lineIndex, registry };
}
