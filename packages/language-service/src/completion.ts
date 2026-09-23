import {
  describeType,
  isRequired,
  labelSpec,
  type ContainerDirective,
  type DirectiveForm,
  type DirectiveSpec,
  type Schema,
} from '@markup-lang/core';
import type { Analysis } from './analysis.ts';
import { attributeDocs, directiveDocs, schemaDocs } from './docs.ts';

export type CompletionKind =
  'component' | 'attribute' | 'value' | 'key' | 'anchor' | 'language' | 'footnote' | 'snippet';

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  detail?: string;
  /** Markdown documentation. */
  documentation?: string;
  /** Text replacing [from, to). May be a snippet (`${1:placeholder}`) when `snippet` is true. */
  insertText: string;
  snippet?: boolean;
  sortText?: string;
}

export interface CompletionResult {
  from: number;
  to: number;
  items: CompletionItem[];
}

const LANGUAGES = [
  'markup',
  'sh',
  'bash',
  'powershell',
  'js',
  'ts',
  'jsx',
  'tsx',
  'json',
  'html',
  'css',
  'scss',
  'python',
  'rust',
  'go',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'sql',
  'yaml',
  'toml',
  'xml',
  'diff',
  'dockerfile',
  'md',
  'text',
];

const CONTEXT_WINDOW = 1000;

export function getCompletions(analysis: Analysis, offset: number): CompletionResult | null {
  const line = analysis.lineAt(offset);
  const before = line.text.slice(0, offset - line.start);
  // Inline contexts are local: looking at a bounded window keeps unanchored
  // patterns linear on pathological, very long lines.
  const near = before.length > CONTEXT_WINDOW ? before.slice(-CONTEXT_WINDOW) : before;
  return (
    dataCompletions(analysis, offset, before) ??
    blockDirectiveCompletions(analysis, offset, before) ??
    attributeCompletions(analysis, offset, near) ??
    inlineDirectiveCompletions(analysis, offset, near) ??
    anchorCompletions(analysis, offset, near) ??
    footnoteCompletions(analysis, offset, near) ??
    languageCompletions(offset, before)
  );
}

// ---------------------------------------------------------------------------
// Components

/** `:::na|` or `::na|` at the start of a line (after container prefixes). */
function blockDirectiveCompletions(
  analysis: Analysis,
  offset: number,
  before: string,
): CompletionResult | null {
  // Every repetition must consume a container marker, so the whitespace runs are
  // unambiguous and matching is linear (a nested `[ \t]*` here was exponential).
  const m = /^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)]))*[ \t]*(:{2,})([A-Za-z][\w-]*)?$/.exec(before);
  if (!m) return null;
  const colons = m[1]!;
  const typed = m[2] ?? '';
  const form: DirectiveForm = colons.length >= 3 ? 'container' : 'leaf';
  const from = offset - colons.length - typed.length;
  const indent = /^[ \t]*/.exec(before)![0];
  const items = analysis.registry
    .list()
    .filter((spec) => spec.forms.includes(form))
    .map((spec) => componentItem(spec, form, colons, indent));
  return { from, to: offset, items };
}

/** `:na|` inside text. */
function inlineDirectiveCompletions(
  analysis: Analysis,
  offset: number,
  before: string,
): CompletionResult | null {
  const m = /(?:^|[^\w:]):([A-Za-z][\w-]*)?$/.exec(before);
  if (!m) return null;
  const typed = m[1] ?? '';
  const from = offset - typed.length - 1;
  const items = analysis.registry
    .list()
    .filter((spec) => spec.forms.includes('inline'))
    .map((spec) => componentItem(spec, 'inline', ':', ''));
  return items.length ? { from, to: offset, items } : null;
}

function componentItem(
  spec: DirectiveSpec,
  form: DirectiveForm,
  colons: string,
  indent: string,
): CompletionItem {
  return {
    label: spec.name,
    kind: 'component',
    detail: `${form} component`,
    documentation: directiveDocs(spec),
    insertText: snippetFor(spec, form, colons, indent),
    snippet: true,
    sortText: `${spec.category === 'callout' ? '1' : '0'}${spec.name}`,
  };
}

/** A snippet for the given form, honouring the typed number of colons and indentation. */
export function snippetFor(
  spec: DirectiveSpec,
  form: DirectiveForm,
  colons: string,
  indent: string,
): string {
  const preferred = spec.forms[0];
  if (spec.snippet && preferred === form) {
    const fence = /^:+/.exec(spec.snippet)?.[0] ?? '';
    let snippet = spec.snippet;
    // Keep extra colons the author typed (for nesting).
    if (form === 'container' && colons.length > fence.length) {
      snippet = snippet.replace(new RegExp(`(^|\\n)${fence}(?!:)`, 'g'), `$1${colons}`);
    }
    return snippet.replace(/\n/g, `\n${indent}`);
  }
  const label = labelSpec(spec);
  const labelPart = label.use === 'required' ? '[${1:label}]' : '';
  const required = Object.entries(spec.attributes ?? {}).filter(([, schema]) => isRequired(schema));
  const attrs = required.length
    ? `{${required.map(([key], i) => `${key}=\${${i + 2}}`).join(' ')}}`
    : '';
  const head = `${colons}${spec.name}${labelPart}${attrs}`;
  if (form !== 'container') return head;
  return `${head}\n${indent}$0\n${indent}${colons}`;
}

// ---------------------------------------------------------------------------
// Attributes

function attributeCompletions(
  analysis: Analysis,
  offset: number,
  before: string,
): CompletionResult | null {
  // The name of the directive whose `{` is open before the cursor.
  const m =
    /(?:^|[^\w:])(:{1,})([A-Za-z][\w-]*)(\[(?:[^\]\\]|\\.)*\])?\{([^{}]*)$/.exec(before) ??
    /^[ \t>]*(:{2,})([A-Za-z][\w-]*)(\[(?:[^\]\\]|\\.)*\])?\{([^{}]*)$/.exec(before);
  if (!m) return null;
  const spec = analysis.registry.get(m[2]!);
  if (!spec) return null;
  const inside = m[4]!;
  const declared = spec.attributes ?? {};
  // Value position: `key=partial` or `key="partial`
  const value = /([A-Za-z_][\w:.-]*)=("?)([^\s"]*)$/.exec(inside);
  if (value) {
    const schema = Object.hasOwn(declared, value[1]!) ? declared[value[1]!] : undefined;
    if (!schema) return null;
    const values = valuesOf(schema);
    if (values.length === 0) return null;
    return {
      from: offset - value[3]!.length,
      to: offset,
      items: values.map((v) => ({
        label: v.label,
        kind: 'value',
        detail: describeType(schema),
        documentation: v.doc,
        insertText: v.label,
      })),
    };
  }
  const token = /(?:^|[\s,])([A-Za-z_][\w:.-]*)?$/.exec(inside);
  if (!token) return null;
  const typed = token[1] ?? '';
  const used = new Set(
    [...inside.matchAll(/([A-Za-z_][\w:.-]*)(?==|\s|,|$)/g)]
      .map((x) => x[1]!)
      .filter((k) => k !== typed),
  );
  const items: CompletionItem[] = Object.entries(declared)
    .filter(([key]) => !used.has(key))
    .map(([key, schema]) => ({
      label: key,
      kind: 'attribute' as const,
      detail: describeType(schema),
      documentation: attributeDocs(key, schema),
      insertText:
        schema.kind === 'boolean'
          ? key
          : schema.kind === 'enum'
            ? `${key}=\${1|${schema.values.join(',')}|}`
            : `${key}=\${1}`,
      snippet: schema.kind !== 'boolean',
    }));
  return items.length ? { from: offset - typed.length, to: offset, items } : null;
}

function valuesOf(schema: Schema): { label: string; doc?: string }[] {
  switch (schema.kind) {
    case 'enum':
      return schema.values.map((v) => ({ label: v, doc: schema.valueDescriptions?.[v] }));
    case 'boolean':
      return [{ label: 'true' }, { label: 'false' }];
    case 'union':
      return schema.options.flatMap(valuesOf);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Data bodies

function dataCompletions(
  analysis: Analysis,
  offset: number,
  before: string,
): CompletionResult | null {
  const node = dataDirectiveAt(analysis, offset);
  if (!node) return null;
  const spec = analysis.registry.get(node.name);
  if (!spec?.data) return null;
  const line = analysis.lineAt(offset);
  const lines = analysis.text
    .slice(node.openRange.end.offset, line.start)
    .split(/\r\n|\r|\n/)
    .slice(1);
  const indent = /^ */.exec(before)![0].length;
  const path = keyPath(lines, indent);
  const schema = resolve(spec.data, path);
  if (!schema) return null;

  // Value position: `key: partial`
  const value = /^\s*(?:-\s+)?([A-Za-z_][\w-]*):\s+(\S*)$/.exec(before);
  if (value) {
    const target = resolve(schema, [value[1]!]);
    if (!target) return null;
    const values = valuesOf(target);
    if (!values.length) return null;
    return {
      from: offset - value[2]!.length,
      to: offset,
      items: values.map((v) => ({
        label: v.label,
        kind: 'value',
        documentation: v.doc,
        insertText: v.label,
      })),
    };
  }
  const key = /^\s*(?:-\s+)?([A-Za-z_][\w-]*)?$/.exec(before);
  if (!key || schema.kind !== 'object') return null;
  const typed = key[1] ?? '';
  const siblings = siblingKeys(lines, indent);
  const items: CompletionItem[] = Object.entries(schema.properties)
    .filter(([k]) => !siblings.has(k))
    .map(([k, s]) => ({
      label: k,
      kind: 'key' as const,
      detail: describeType(s),
      documentation: schemaDocs(k, s),
      insertText:
        s.kind === 'object' ||
        s.kind === 'record' ||
        (s.kind === 'array' && s.items.kind === 'object')
          ? `${k}:\n${' '.repeat(indent + 2)}`
          : `${k}: `,
    }));
  return items.length ? { from: offset - typed.length, to: offset, items } : null;
}

function dataDirectiveAt(analysis: Analysis, offset: number): ContainerDirective | null {
  for (const { node } of analysis.nodes()) {
    if (node.type !== 'containerDirective' || node.body.kind !== 'data') continue;
    const bodyStart = node.openRange.end.offset;
    const bodyEnd = node.closeRange ? node.closeRange.start.offset : node.position.end.offset + 1;
    if (offset > bodyStart && offset <= bodyEnd) return node;
  }
  return null;
}

/** Keys of the mappings enclosing the current line, outermost first. */
function keyPath(lines: string[], indent: number): string[] {
  const path: string[] = [];
  let current = indent;
  for (let i = lines.length - 1; i >= 0 && current > 0; i--) {
    const text = lines[i]!;
    if (text.trim() === '' || text.trim().startsWith('#')) continue;
    const lineIndent = /^ */.exec(text)![0].length;
    if (lineIndent >= current) continue;
    current = lineIndent;
    const m = /^ *(?:-\s+)?([A-Za-z_][\w-]*):\s*$/.exec(text);
    if (m) path.unshift(m[1]!);
  }
  return path;
}

/** Keys already present in the mapping the cursor is in (a `- key:` line counts at its key's column). */
function siblingKeys(lines: string[], indent: number): Set<string> {
  const keys = new Set<string>();
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = lines[i]!;
    if (text.trim() === '') continue;
    const lineIndent = /^ */.exec(text)![0].length;
    const m = /^( *)(-\s+)?([A-Za-z_][\w-]*):/.exec(text);
    if (m && m[1]!.length + (m[2]?.length ?? 0) === indent) keys.add(m[3]!);
    if (lineIndent < indent) break;
  }
  return keys;
}

/** Follows object properties, array items and record values. */
function resolve(schema: Schema, path: readonly string[]): Schema | null {
  let current: Schema | null = schema;
  for (const key of path) {
    current = step(current, key);
    if (!current) return null;
  }
  return current;
}

function step(schema: Schema | null, key: string): Schema | null {
  if (!schema) return null;
  switch (schema.kind) {
    case 'object': {
      const property = Object.hasOwn(schema.properties, key) ? schema.properties[key]! : null;
      if (!property) return null;
      return property.kind === 'array' ? property.items : property;
    }
    case 'record':
      return schema.values;
    case 'array':
      return step(schema.items, key);
    case 'union':
      for (const option of schema.options) {
        const found = step(option, key);
        if (found) return found;
      }
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Links, footnotes, code fences

function anchorCompletions(
  analysis: Analysis,
  offset: number,
  before: string,
): CompletionResult | null {
  const m = /\]\(#([^\s)]*)$/.exec(before);
  if (!m) return null;
  const typed = m[1]!;
  return {
    from: offset - typed.length,
    to: offset,
    items: analysis.anchors.anchors.map((a) => ({
      label: a.id,
      kind: 'anchor',
      detail: a.depth ? `${'#'.repeat(a.depth)} ${a.text}` : 'id',
      insertText: a.id,
    })),
  };
}

function footnoteCompletions(
  analysis: Analysis,
  offset: number,
  before: string,
): CompletionResult | null {
  const m = /\[\^([^\]\s]*)$/.exec(before);
  if (!m) return null;
  const typed = m[1]!;
  const items = [...analysis.footnotes().values()].map((f) => ({
    label: f.label,
    kind: 'footnote' as const,
    detail: 'footnote',
    insertText: `${f.label}]`,
  }));
  return items.length ? { from: offset - typed.length, to: offset, items } : null;
}

function languageCompletions(offset: number, before: string): CompletionResult | null {
  const m = /^[ \t>]*(?:```|~~~)([\w+#-]*)$/.exec(before);
  if (!m) return null;
  const typed = m[1]!;
  return {
    from: offset - typed.length,
    to: offset,
    items: LANGUAGES.map((l) => ({ label: l, kind: 'language', insertText: l })),
  };
}
