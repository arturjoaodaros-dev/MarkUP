/**
 * Semantic validation: directive specs (forms, labels, attributes, data bodies,
 * structure) and document-level rules (ids, footnotes, anchors, URLs).
 *
 * Validation never changes the tree. It only reports diagnostics (MU2xxx).
 */
import type { Block, Directive, Document, Node } from './ast.ts';
import type { DataNode } from './data/types.ts';
import { directiveForm, isDirective } from './ast.ts';
import type { DiagnosticBag, DiagnosticFix } from './diagnostics.ts';
import { labelSpec, type DirectiveRegistry, type DirectiveSpec } from './directives/spec.ts';
import { closest, coerceAttribute, isRequired, validateData } from './schema/schema.ts';
import type { Range } from './source/position.ts';
import { collectAnchors, type Anchor } from './util/anchors.ts';
import { visit } from './util/visit.ts';

const SAFE_URL = /^(?:https?:|mailto:|tel:|ftp:|#|\/|\.|\?)/i;
const HAS_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|gif|jpeg|jpg|webp|avif|svg\+xml);/i;

/**
 * Is a URL safe to emit? Relative URLs and http(s), mailto, tel and ftp are;
 * `javascript:`, `vbscript:`, `file:` and non-image `data:` are not. Renderers use
 * the same rule, so validation warnings match what is actually dropped.
 */
export function isSafeUrl(url: string, kind: 'link' | 'image' = 'link'): boolean {
  // Browsers ignore control characters and whitespace inside schemes.
  // eslint-disable-next-line no-control-regex
  const normalized = url.replace(/[\x00-\x20\x7f-\x9f]/g, '');
  if (normalized === '' || SAFE_URL.test(normalized)) return true;
  if (kind === 'image' && SAFE_DATA_IMAGE.test(normalized)) return true;
  return !HAS_SCHEME.test(normalized);
}

export function validateDocument(document: Document, registry: DirectiveRegistry, diagnostics: DiagnosticBag): void {
  new Validator(document, registry, diagnostics).run();
}

class Validator {
  private readonly document: Document;
  private readonly registry: DirectiveRegistry;
  private readonly diagnostics: DiagnosticBag;

  constructor(document: Document, registry: DirectiveRegistry, diagnostics: DiagnosticBag) {
    this.document = document;
    this.registry = registry;
    this.diagnostics = diagnostics;
  }

  run(): void {
    this.checkFrontMatter();
    const footnoteRefs = new Map<string, { range: Range; label: string }[]>();
    const anchorLinks: { url: string; range: Range }[] = [];

    visit(this.document, (node, ancestors) => {
      if (isDirective(node)) this.checkDirective(node, ancestors);
      switch (node.type) {
        case 'footnoteReference': {
          const list = footnoteRefs.get(node.identifier) ?? [];
          list.push({ range: node.position, label: node.label });
          footnoteRefs.set(node.identifier, list);
          break;
        }
        case 'link':
        case 'image':
        case 'definition': {
          const url = node.url;
          if (!isSafeUrl(url, node.type === 'image' ? 'image' : 'link')) {
            this.diagnostics.report('MU2023', node.position, `The URL \`${truncate(url)}\` uses a scheme that is not allowed; renderers drop it.`);
          }
          if (url.startsWith('#') && url.length > 1) anchorLinks.push({ url, range: node.position });
          break;
        }
        default:
          break;
      }
    });

    this.checkFootnotes(footnoteRefs);
    const anchors = collectAnchors(this.document);
    this.checkDuplicateIds(anchors.anchors);
    this.checkAnchors(anchorLinks, anchors.byId);
  }

  private checkDuplicateIds(anchors: readonly Anchor[]): void {
    const seen = new Map<string, Anchor>();
    for (const anchor of anchors) {
      if (!anchor.explicit) continue;
      const first = seen.get(anchor.id);
      if (first) {
        this.diagnostics.report('MU2020', anchor.range, `The id \`${anchor.id}\` is already used; links to \`#${anchor.id}\` go to the first element.`, {
          related: [{ range: first.range, message: 'First used here.' }],
        });
      } else {
        seen.set(anchor.id, anchor);
      }
    }
  }

  private checkFrontMatter(): void {
    const fm = this.document.frontMatter;
    if (fm?.value && fm.value.kind !== 'map') {
      this.diagnostics.report('MU2010', fm.value.range, 'Front matter must be a mapping of `key: value` pairs.');
    }
  }

  // -------------------------------------------------------------------------
  // Directives

  private checkDirective(node: Directive, ancestors: readonly Node[]): void {
    const spec = this.registry.get(node.name);
    const form = directiveForm(node);
    if (!spec) {
      const suggestion = this.registry.suggest(node.name, form);
      const fixes: DiagnosticFix[] = suggestion
        ? [{ title: `Change to \`${suggestion}\``, edits: [{ range: node.nameRange, newText: suggestion }], preferred: true }]
        : [];
      this.diagnostics.report(
        'MU2001',
        node.nameRange,
        `Unknown component \`${node.name}\`${suggestion ? ` — did you mean \`${suggestion}\`?` : '.'} It is rendered as a plain container.`,
        { fixes },
      );
      return;
    }

    if (!spec.forms.includes(form)) {
      const allowed = spec.forms.map((f) => `\`${formSyntax(f)}${spec.name}\``).join(' or ');
      this.diagnostics.report('MU2002', node.nameRange, `\`${spec.name}\` cannot be used as ${article(form)} ${form} directive; use ${allowed}.`);
    }

    this.checkLabel(node, spec);
    this.checkAttributes(node, spec);
    if (node.type === 'containerDirective') this.checkBody(node, spec);
    this.checkStructure(node, spec, ancestors);

    if (spec.validate) {
      const parent = [...ancestors].reverse().find(isDirective) ?? null;
      try {
        spec.validate(node, {
          document: this.document,
          parent,
          report: (code, range, message, options) => this.diagnostics.report(code, range, message, options),
        });
      } catch (error) {
        this.diagnostics.report('MU9001', node.nameRange, `The \`${spec.name}\` validator failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private checkLabel(node: Directive, spec: DirectiveSpec): void {
    const label = labelSpec(spec);
    const hasLabel = node.rawLabel !== null && node.rawLabel.trim().length > 0;
    if (label.use === 'required' && !hasLabel) {
      const insertAt = node.nameRange.end;
      this.diagnostics.report('MU2006', node.nameRange, `\`${spec.name}\` needs a label: \`${formSyntax(directiveForm(node))}${spec.name}[${label.description ?? 'text'}]\`.`, {
        fixes:
          node.labelRange === null
            ? [{ title: 'Add a label', edits: [{ range: { start: insertAt, end: insertAt }, newText: '[]' }] }]
            : [],
      });
    } else if (label.use === 'none' && node.labelRange) {
      this.diagnostics.report('MU2007', node.labelRange, `\`${spec.name}\` does not use a label; it is ignored.`, {
        fixes: [{ title: 'Remove the label', edits: [{ range: node.labelRange, newText: '' }], preferred: true }],
      });
    }
  }

  private checkAttributes(node: Directive, spec: DirectiveSpec): void {
    const declared = spec.attributes ?? {};
    const present = new Set<string>();
    for (const item of node.attributes?.items ?? []) {
      if (item.kind === 'id' || item.kind === 'class') continue;
      present.add(item.name);
      const schema = Object.hasOwn(declared, item.name) ? declared[item.name] : undefined;
      if (!schema) {
        if (spec.additionalAttributes) continue;
        const suggestion = closest(item.name, Object.keys(declared));
        const known = Object.keys(declared);
        this.diagnostics.report(
          'MU2003',
          item.nameRange ?? item.range,
          `\`${spec.name}\` has no attribute \`${item.name}\`${suggestion ? ` — did you mean \`${suggestion}\`?` : '.'}${
            known.length && !suggestion ? ` Known attributes: ${known.map((k) => `\`${k}\``).join(', ')}.` : ''
          }`,
          {
            fixes: suggestion
              ? [{ title: `Change to \`${suggestion}\``, edits: [{ range: item.nameRange ?? item.range, newText: suggestion }], preferred: true }]
              : [],
          },
        );
        continue;
      }
      const result = coerceAttribute(item.value, schema);
      if (!result.ok) {
        const fixes: DiagnosticFix[] = [];
        if (schema.kind === 'enum' && typeof item.value === 'string' && item.valueRange) {
          const suggestion = closest(item.value, schema.values);
          if (suggestion) fixes.push({ title: `Change to \`${suggestion}\``, edits: [{ range: item.valueRange, newText: suggestion }], preferred: true });
        }
        this.diagnostics.report('MU2004', item.valueRange ?? item.range, `\`${item.name}\`: ${result.message}`, { fixes });
      }
    }
    for (const [key, schema] of Object.entries(declared)) {
      // In data components, required values may be given in the body instead.
      if (isRequired(schema) && !present.has(key) && spec.content !== 'data') {
        this.diagnostics.report('MU2005', node.nameRange, `\`${spec.name}\` requires the attribute \`${key}\`${schema.description ? ` (${schema.description.replace(/\.$/, '')})` : ''}.`);
      }
    }
  }

  private checkBody(node: Directive & { type: 'containerDirective' }, spec: DirectiveSpec): void {
    const body = node.body;
    if (body.kind === 'data') {
      if (body.value === null) {
        if (spec.bodyRequired) this.diagnostics.report('MU2011', node.openRange, `\`${spec.name}\` needs a data body.`);
        return;
      }
      if (spec.data) {
        for (const issue of validateData(body.value, spec.data)) {
          const range = issue.onKey ? keyRangeFor(body.value, issue.node) ?? issue.node.range : issue.node.range;
          this.diagnostics.report('MU2010', range, issue.message);
        }
      }
      return;
    }
    if (spec.bodyRequired) {
      const empty = body.kind === 'raw' ? body.value.trim().length === 0 : body.children.length === 0;
      if (empty) this.diagnostics.report('MU2011', node.openRange, `\`${spec.name}\` needs content.`);
    }
  }

  private checkStructure(node: Directive, spec: DirectiveSpec, ancestors: readonly Node[]): void {
    if (spec.allowedParents) {
      const parent = directParentDirective(node, ancestors);
      if (!parent || !spec.allowedParents.includes(parent.name)) {
        const names = spec.allowedParents.map((n) => `\`${n}\``).join(' or ');
        this.diagnostics.report('MU2008', node.nameRange, `\`${spec.name}\` must be placed directly inside ${names}.`);
      }
    }
    if (spec.allowedChildren && node.type === 'containerDirective' && node.body.kind === 'flow') {
      for (const child of node.body.children) {
        if (child.type === 'comment' || child.type === 'definition') continue;
        const ok = (child.type === 'containerDirective' || child.type === 'leafDirective') && spec.allowedChildren.includes(child.name);
        if (!ok) {
          const names = spec.allowedChildren.map((n) => `\`${n}\``).join(', ');
          this.diagnostics.report('MU2009', childRange(child), `\`${spec.name}\` may only contain ${names}; this ${describeBlock(child)} is not allowed here.`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Document-level rules

  private checkFootnotes(references: Map<string, { range: Range; label: string }[]>): void {
    const definitions = new Map<string, { range: Range; label: string }>();
    visit(this.document, (node) => {
      if (node.type === 'footnoteDefinition' && !definitions.has(node.identifier)) {
        definitions.set(node.identifier, { range: node.position, label: node.label });
      }
    });
    for (const [identifier, refs] of references) {
      if (definitions.has(identifier)) continue;
      for (const ref of refs) {
        this.diagnostics.report(
          'MU2021',
          ref.range,
          `Footnote \`[^${ref.label}]\` has no definition. Add a line such as \`[^${ref.label}]: Text.\` to the document.`,
        );
      }
    }
    for (const [identifier, definition] of definitions) {
      if (references.has(identifier)) continue;
      // Highlight just the `[^label]` marker, which is always on the first line.
      const { start } = definition.range;
      const width = definition.label.length + 3;
      const end = { line: start.line, column: start.column + width, offset: start.offset + width };
      this.diagnostics.report('MU2022', { start, end }, `Footnote \`[^${definition.label}]\` is never referenced.`);
    }
  }

  private checkAnchors(links: { url: string; range: Range }[], byId: ReadonlyMap<string, Anchor>): void {
    if (links.length === 0) return;
    const ids = [...byId.keys()];
    for (const link of links) {
      let id = link.url.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // Keep the raw fragment.
      }
      if (byId.has(id)) continue;
      const suggestion = closest(id, ids);
      this.diagnostics.report(
        'MU2025',
        link.range,
        `No heading or element has the id \`${id}\`${suggestion ? ` — did you mean \`#${suggestion}\`?` : '.'}`,
      );
    }
  }
}

function directParentDirective(node: Directive, ancestors: readonly Node[]): Directive | null {
  const parent = ancestors[ancestors.length - 1];
  if (node.type === 'inlineDirective') {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i]!;
      if (isDirective(a)) return a;
    }
    return null;
  }
  return parent && isDirective(parent) ? parent : null;
}

function keyRangeFor(root: DataNode, target: DataNode): Range | null {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.kind === 'map') {
      for (const entry of node.entries) {
        if (entry.value === target) return entry.keyRange;
        stack.push(entry.value);
      }
    } else if (node.kind === 'seq') {
      stack.push(...node.items);
    }
  }
  return null;
}

function childRange(block: Block): Range {
  if (block.type === 'containerDirective') return block.openRange;
  const { start } = block.position;
  const end = block.position.end.line === start.line ? block.position.end : { line: start.line, column: start.column + 1, offset: start.offset + 1 };
  return { start, end };
}

function describeBlock(block: Block): string {
  switch (block.type) {
    case 'containerDirective':
    case 'leafDirective':
      return `\`${block.name}\``;
    case 'thematicBreak':
      return 'thematic break';
    case 'code':
      return 'code block';
    case 'footnoteDefinition':
      return 'footnote';
    default:
      return block.type;
  }
}

function formSyntax(form: string): string {
  return form === 'container' ? ':::' : form === 'leaf' ? '::' : ':';
}

function article(word: string): string {
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}

function truncate(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}

