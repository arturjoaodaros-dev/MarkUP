import {
  collectAnchors,
  createRegistry,
  parse,
  visit,
  type AnchorIndex,
  type Definition,
  type Diagnostic,
  type DirectiveRegistry,
  type FootnoteDefinition,
  type MarkupPlugin,
  type Node,
  type ParseResult,
} from '@markup-lang/core';

export interface LanguageServiceOptions {
  plugins?: readonly MarkupPlugin[];
}

/** Everything the language features need about one version of a document. */
export class Analysis {
  readonly text: string;
  readonly result: ParseResult;
  readonly registry: DirectiveRegistry;
  private anchorsCache: AnchorIndex | null = null;
  private nodesCache: { node: Node; ancestors: readonly Node[] }[] | null = null;

  constructor(text: string, registry: DirectiveRegistry) {
    this.text = text;
    this.registry = registry;
    try {
      this.result = parse(text, { registry });
    } catch (error) {
      // The parser is designed never to throw; if it does, editors must keep working.
      this.result = parse('', { registry });
      this.result.diagnostics.push({
        code: 'MU9001',
        severity: 'error',
        message: `Internal parser error: ${error instanceof Error ? error.message : String(error)}. Please report this document.`,
        range: this.result.lineIndex.range(0, 0),
        source: 'markup',
      });
    }
  }

  get document() {
    return this.result.document;
  }

  get diagnostics(): Diagnostic[] {
    return this.result.diagnostics;
  }

  get lineIndex() {
    return this.result.lineIndex;
  }

  get anchors(): AnchorIndex {
    return (this.anchorsCache ??= collectAnchors(this.result.document));
  }

  /** Every node with its ancestors, in document order. */
  nodes(): { node: Node; ancestors: readonly Node[] }[] {
    if (!this.nodesCache) {
      const list: { node: Node; ancestors: readonly Node[] }[] = [];
      visit(this.result.document, (node, ancestors) => {
        list.push({ node, ancestors });
      });
      this.nodesCache = list;
    }
    return this.nodesCache;
  }

  /** The innermost nodes containing `offset`, outermost first. */
  pathAt(offset: number): Node[] {
    let best: { node: Node; ancestors: readonly Node[] } | null = null;
    for (const entry of this.nodes()) {
      const { start, end } = entry.node.position;
      if (start.offset <= offset && offset <= end.offset && entry.node.type !== 'document') best = entry;
    }
    return best ? [...best.ancestors, best.node] : [this.result.document];
  }

  definitions(): Map<string, Definition> {
    const map = new Map<string, Definition>();
    for (const { node } of this.nodes()) if (node.type === 'definition' && !map.has(node.identifier)) map.set(node.identifier, node);
    return map;
  }

  footnotes(): Map<string, FootnoteDefinition> {
    const map = new Map<string, FootnoteDefinition>();
    for (const { node } of this.nodes()) if (node.type === 'footnoteDefinition' && !map.has(node.identifier)) map.set(node.identifier, node);
    return map;
  }

  lineAt(offset: number): { text: string; start: number; line: number } {
    const point = this.lineIndex.pointAt(offset);
    const start = this.lineIndex.lineStarts[point.line - 1] ?? 0;
    return { text: this.lineIndex.lineText(point.line), start, line: point.line };
  }
}

/**
 * Entry point for editors. Keeps the latest analysis per document so that every
 * feature (diagnostics, highlighting, outline, completion…) shares one parse.
 */
export class LanguageService {
  readonly registry: DirectiveRegistry;
  private readonly cache = new Map<string, Analysis>();

  constructor(options: LanguageServiceOptions = {}) {
    this.registry = createRegistry(options.plugins ?? []);
  }

  analyze(text: string, key = 'default'): Analysis {
    const cached = this.cache.get(key);
    if (cached && cached.text === text) return cached;
    const analysis = new Analysis(text, this.registry);
    this.cache.set(key, analysis);
    return analysis;
  }

  forget(key: string): void {
    this.cache.delete(key);
  }
}
