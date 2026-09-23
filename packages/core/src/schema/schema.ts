/**
 * A small, declarative schema language.
 *
 * Schemas are plain data. They describe component attributes and data bodies,
 * and the same description drives:
 *
 * - validation with precise positions ({@link validateData}, {@link coerceAttribute})
 * - editor completions and hovers (language service)
 * - the generated component reference and editor snippets
 */
import type { DataNode } from '../data/types.ts';

interface Base {
  description?: string;
  /** Not required. Properties with a `default` are implicitly optional. */
  optional?: boolean;
  default?: unknown;
  /** Example value shown in documentation and completions. */
  example?: string;
}

export interface StringSchema extends Base {
  kind: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  /** Human description of `pattern`, used in error messages. */
  patternLabel?: string;
}

export interface NumberSchema extends Base {
  kind: 'number';
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface BooleanSchema extends Base {
  kind: 'boolean';
}

export interface EnumSchema extends Base {
  kind: 'enum';
  values: readonly string[];
  /** Per-value documentation. */
  valueDescriptions?: Readonly<Record<string, string>>;
}

export interface ArraySchema extends Base {
  kind: 'array';
  items: Schema;
  minItems?: number;
  maxItems?: number;
}

export interface RecordSchema extends Base {
  kind: 'record';
  values: Schema;
  minEntries?: number;
}

export interface ObjectSchema extends Base {
  kind: 'object';
  properties: Readonly<Record<string, Schema>>;
  /** Allow keys that are not declared. Defaults to false (unknown keys are reported). */
  additional?: boolean;
}

export interface UnionSchema extends Base {
  kind: 'union';
  options: readonly Schema[];
}

export interface AnySchema extends Base {
  kind: 'any';
}

export type Schema =
  | StringSchema
  | NumberSchema
  | BooleanSchema
  | EnumSchema
  | ArraySchema
  | RecordSchema
  | ObjectSchema
  | UnionSchema
  | AnySchema;

type Options<T extends Schema> = Omit<T, 'kind' | 'items' | 'values' | 'properties' | 'options'>;

/** Schema builders. */
export const s = {
  string: (options: Options<StringSchema> = {}): StringSchema => ({ kind: 'string', ...options }),
  number: (options: Options<NumberSchema> = {}): NumberSchema => ({ kind: 'number', ...options }),
  boolean: (options: Options<BooleanSchema> = {}): BooleanSchema => ({ kind: 'boolean', ...options }),
  enum: (values: readonly string[], options: Options<EnumSchema> & { valueDescriptions?: Record<string, string> } = {}): EnumSchema => ({
    kind: 'enum',
    values,
    ...options,
  }),
  array: (items: Schema, options: Options<ArraySchema> = {}): ArraySchema => ({ kind: 'array', items, ...options }),
  record: (values: Schema, options: Options<RecordSchema> = {}): RecordSchema => ({ kind: 'record', values, ...options }),
  object: (properties: Record<string, Schema>, options: Options<ObjectSchema> = {}): ObjectSchema => ({
    kind: 'object',
    properties,
    ...options,
  }),
  union: (options: readonly Schema[], extra: Options<UnionSchema> = {}): UnionSchema => ({ kind: 'union', options, ...extra }),
  any: (options: Options<AnySchema> = {}): AnySchema => ({ kind: 'any', ...options }),
};

export function isRequired(schema: Schema): boolean {
  return !schema.optional && schema.default === undefined;
}

/** A compact, human-readable type label: `number (0–100)`, `"bar" | "line"`, `string[]`. */
export function describeType(schema: Schema): string {
  switch (schema.kind) {
    case 'string':
      return 'string';
    case 'number': {
      const base = schema.integer ? 'integer' : 'number';
      if (schema.min !== undefined && schema.max !== undefined) return `${base} (${schema.min}–${schema.max})`;
      if (schema.min !== undefined) return `${base} (≥ ${schema.min})`;
      if (schema.max !== undefined) return `${base} (≤ ${schema.max})`;
      return base;
    }
    case 'boolean':
      return 'boolean';
    case 'enum':
      return schema.values.map((v) => JSON.stringify(v)).join(' | ');
    case 'array':
      return `${wrap(describeType(schema.items))}[]`;
    case 'record':
      return `map of ${describeType(schema.values)}`;
    case 'object':
      return 'object';
    case 'union':
      return schema.options.map(describeType).join(' | ');
    case 'any':
      return 'any';
  }
}

function wrap(label: string): string {
  return label.includes(' ') ? `(${label})` : label;
}

// ---------------------------------------------------------------------------
// Data validation

export interface DataIssue {
  node: DataNode;
  /** Report on the key rather than the value (unknown or duplicate keys). */
  onKey?: boolean;
  path: string;
  message: string;
}

/** Validates a data tree. Returns the issues found (empty when valid). */
export function validateData(node: DataNode | null, schema: Schema, path = ''): DataIssue[] {
  const issues: DataIssue[] = [];
  check(node, schema, path, issues);
  return issues;
}

function check(node: DataNode | null, schema: Schema, path: string, issues: DataIssue[]): void {
  if (node === null) return;
  const at = (message: string, target: DataNode = node!, onKey = false) =>
    issues.push({ node: target, path, message: path ? `${path}: ${message}` : message, onKey });

  switch (schema.kind) {
    case 'any':
      return;
    case 'string': {
      if (node.kind !== 'scalar' || typeof node.value !== 'string') {
        // Numbers and booleans are accepted as strings when written plainly (e.g. `year: 2026`).
        if (node.kind === 'scalar' && node.value !== null && node.style === 'plain') {
          checkString(String(node.value), schema, at);
          return;
        }
        at(`Expected a string, found ${describeNode(node)}.`);
        return;
      }
      checkString(node.value, schema, at);
      return;
    }
    case 'number':
      if (node.kind !== 'scalar' || typeof node.value !== 'number') {
        at(`Expected a number, found ${describeNode(node)}.`);
        return;
      }
      checkNumber(node.value, schema, at);
      return;
    case 'boolean':
      if (node.kind !== 'scalar' || typeof node.value !== 'boolean') at(`Expected \`true\` or \`false\`, found ${describeNode(node)}.`);
      return;
    case 'enum': {
      const value = node.kind === 'scalar' && node.value !== null ? String(node.value) : null;
      if (value === null || !schema.values.includes(value)) {
        at(`Expected one of ${schema.values.map((v) => `\`${v}\``).join(', ')}, found ${describeNode(node)}.`);
      }
      return;
    }
    case 'array': {
      if (node.kind !== 'seq') {
        at(`Expected a list, found ${describeNode(node)}.`);
        return;
      }
      if (schema.minItems !== undefined && node.items.length < schema.minItems) {
        at(`Expected at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}, found ${node.items.length}.`);
      }
      if (schema.maxItems !== undefined && node.items.length > schema.maxItems) {
        at(`Expected at most ${schema.maxItems} items, found ${node.items.length}.`);
      }
      node.items.forEach((item, i) => check(item, schema.items, `${path}[${i}]`, issues));
      return;
    }
    case 'record': {
      if (node.kind !== 'map') {
        at(`Expected a mapping of keys to values, found ${describeNode(node)}.`);
        return;
      }
      if (schema.minEntries !== undefined && node.entries.length < schema.minEntries) {
        at(`Expected at least ${schema.minEntries} entr${schema.minEntries === 1 ? 'y' : 'ies'}.`);
      }
      for (const entry of node.entries) check(entry.value, schema.values, join(path, entry.key), issues);
      return;
    }
    case 'object': {
      if (node.kind !== 'map') {
        at(`Expected a mapping, found ${describeNode(node)}.`);
        return;
      }
      const present = new Set<string>();
      for (const entry of node.entries) {
        present.add(entry.key);
        const property = Object.hasOwn(schema.properties, entry.key) ? schema.properties[entry.key] : undefined;
        if (!property) {
          if (!schema.additional) {
            const suggestion = closest(entry.key, Object.keys(schema.properties));
            issues.push({
              node: entry.value,
              onKey: true,
              path: join(path, entry.key),
              message: `Unknown key \`${entry.key}\`${suggestion ? ` — did you mean \`${suggestion}\`?` : '.'}`,
            });
          }
          continue;
        }
        check(entry.value, property, join(path, entry.key), issues);
      }
      for (const [key, property] of Object.entries(schema.properties)) {
        if (isRequired(property) && !present.has(key)) at(`Missing required key \`${key}\`.`);
      }
      return;
    }
    case 'union': {
      // Report the issues of the closest option: one whose shape (mapping, list or
      // scalar) matches the node, with the fewest issues. Otherwise a generic message.
      let closestIssues: DataIssue[] | null = null;
      for (const option of schema.options) {
        const optionIssues: DataIssue[] = [];
        check(node, option, path, optionIssues);
        if (optionIssues.length === 0) return;
        if (shapeMatches(node, option) && (closestIssues === null || optionIssues.length < closestIssues.length)) {
          closestIssues = optionIssues;
        }
      }
      if (closestIssues) issues.push(...closestIssues);
      else at(`Expected ${describeType(schema)}, found ${describeNode(node)}.`);
      return;
    }
  }
}

function shapeMatches(node: DataNode, schema: Schema): boolean {
  switch (schema.kind) {
    case 'object':
    case 'record':
      return node.kind === 'map';
    case 'array':
      return node.kind === 'seq';
    case 'any':
      return true;
    case 'union':
      return schema.options.some((o) => shapeMatches(node, o));
    default:
      return node.kind === 'scalar';
  }
}

function checkString(value: string, schema: StringSchema, at: (message: string) => void): void {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    at(schema.minLength === 1 ? 'Expected a non-empty string.' : `Expected at least ${schema.minLength} characters.`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) at(`Expected at most ${schema.maxLength} characters.`);
  if (schema.pattern && !schema.pattern.test(value)) at(`Expected ${schema.patternLabel ?? `a value matching ${schema.pattern}`}.`);
}

function checkNumber(value: number, schema: NumberSchema, at: (message: string) => void): void {
  if (schema.integer && !Number.isInteger(value)) at(`Expected an integer, found ${value}.`);
  if (schema.min !== undefined && value < schema.min) at(`Expected a number ≥ ${schema.min}, found ${value}.`);
  if (schema.max !== undefined && value > schema.max) at(`Expected a number ≤ ${schema.max}, found ${value}.`);
}

export function describeNode(node: DataNode): string {
  switch (node.kind) {
    case 'map':
      return 'a mapping';
    case 'seq':
      return 'a list';
    case 'scalar':
      if (node.value === null) return 'an empty value';
      if (typeof node.value === 'string') return `the string ${JSON.stringify(truncate(node.value))}`;
      return `\`${String(node.value)}\``;
  }
}

function truncate(value: string): string {
  return value.length > 40 ? `${value.slice(0, 37)}...` : value;
}

function join(path: string, key: string): string {
  const safe = /^[A-Za-z_][\w-]*$/.test(key) ? key : JSON.stringify(key);
  return path ? `${path}.${safe}` : safe;
}

// ---------------------------------------------------------------------------
// Attribute coercion

export type Coerced = { ok: true; value: unknown } | { ok: false; message: string };

/**
 * Converts a raw attribute value (always a string, or `true` for bare flags)
 * into the type declared by the schema.
 */
export function coerceAttribute(raw: string | true, schema: Schema): Coerced {
  switch (schema.kind) {
    case 'any':
      return { ok: true, value: raw };
    case 'boolean':
      if (raw === true || raw === 'true' || raw === '') return { ok: true, value: true };
      if (raw === 'false') return { ok: true, value: false };
      return { ok: false, message: `Expected \`true\` or \`false\`, found \`${raw}\`.` };
    case 'string': {
      if (raw === true) return { ok: false, message: 'Expected a value (`key=value`), found a bare flag.' };
      const problems: string[] = [];
      checkString(raw, schema, (m) => problems.push(m));
      return problems.length ? { ok: false, message: problems[0]! } : { ok: true, value: raw };
    }
    case 'number': {
      if (raw === true) return { ok: false, message: 'Expected a number (`key=42`), found a bare flag.' };
      const trimmed = raw.trim();
      const value = trimmed === '' ? NaN : Number(trimmed);
      if (!Number.isFinite(value)) return { ok: false, message: `Expected a number, found \`${raw}\`.` };
      const problems: string[] = [];
      checkNumber(value, schema, (m) => problems.push(m));
      return problems.length ? { ok: false, message: problems[0]! } : { ok: true, value };
    }
    case 'enum': {
      if (raw !== true && schema.values.includes(raw)) return { ok: true, value: raw };
      const suggestion = raw === true ? null : closest(raw, schema.values);
      return {
        ok: false,
        message: `Expected one of ${schema.values.map((v) => `\`${v}\``).join(', ')}${raw === true ? '' : `, found \`${raw}\``}${suggestion ? ` — did you mean \`${suggestion}\`?` : '.'}`,
      };
    }
    case 'union': {
      for (const option of schema.options) {
        const result = coerceAttribute(raw, option);
        if (result.ok) return result;
      }
      return { ok: false, message: `Expected ${describeType(schema)}, found \`${raw}\`.` };
    }
    default:
      return { ok: false, message: `Attributes cannot hold ${describeType(schema)} values.` };
  }
}

// ---------------------------------------------------------------------------
// Suggestions

/**
 * Edit distance counting insertions, deletions, substitutions and adjacent
 * transpositions (optimal string alignment), so `kdb` is one edit from `kbd`.
 * Exits early once the distance exceeds `max`.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j]! + 1, current[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prevPrev[j - 2]! + 1);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = current;
  }
  return prev[b.length]!;
}

/** The closest candidate within a distance proportional to the word length, or null. */
export function closest(word: string, candidates: readonly string[]): string | null {
  const lower = word.toLowerCase();
  const max = Math.max(1, Math.floor(word.length / 3));
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = editDistance(lower, candidate.toLowerCase(), max);
    if (d <= max && d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}
