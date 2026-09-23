/**
 * Directive specifications and the registry.
 *
 * A spec describes a component at the *language* level: which syntactic forms it
 * accepts, how its body is parsed (its content model), its label, attribute and
 * data schemas, and structural rules. Specs never contain rendering code —
 * renderers register their own implementations by directive name. This is what
 * lets the parser, validator, editors and documentation share one definition.
 */
import type { Directive, DirectiveForm, Document } from '../ast.ts';
import type { DiagnosticCode, ReportOptions } from '../diagnostics.ts';
import type { Schema } from '../schema/schema.ts';
import { closest } from '../schema/schema.ts';
import type { Range } from '../source/position.ts';

/**
 * How the body of a container directive is parsed.
 *
 * - `flow`: MarkUP block content (paragraphs, lists, nested directives…)
 * - `data`: MarkUP Data, validated against the spec's `data` schema
 * - `raw`: literal text, passed to renderers untouched
 */
export type ContentModel = 'flow' | 'data' | 'raw';

export interface LabelSpec {
  use: 'required' | 'optional' | 'none';
  /** `inline` (default): parsed as MarkUP inline content. `raw`: literal text. */
  model?: 'inline' | 'raw';
  description?: string;
}

export interface DirectiveExample {
  title?: string;
  source: string;
}

export interface DirectiveValidationContext {
  document: Document;
  /** The enclosing directive, if any. */
  parent: Directive | null;
  report(code: DiagnosticCode, range: Range, message: string, options?: ReportOptions): void;
}

export interface DirectiveSpec {
  name: string;
  /** Syntactic forms this component accepts. The first one is the preferred form. */
  forms: readonly DirectiveForm[];
  /** One or two sentences, Markdown allowed. */
  description: string;
  category?: 'callout' | 'layout' | 'content' | 'data' | 'navigation' | 'inline' | (string & {});
  label?: LabelSpec;
  /** Declared attributes. `id` and `class` (`#id`, `.class`) are always accepted. */
  attributes?: Readonly<Record<string, Schema>>;
  /** Accept undeclared attributes without warnings. */
  additionalAttributes?: boolean;
  /** Content model of the container form. Defaults to `flow`. */
  content?: ContentModel;
  /** Schema of the body when `content` is `data`. */
  data?: Schema;
  /** The container form must have a non-empty body. */
  bodyRequired?: boolean;
  /** When set, the directive must be a direct child of one of these directives. */
  allowedParents?: readonly string[];
  /** When set, a flow body may only contain these directives (plus comments). */
  allowedChildren?: readonly string[];
  examples?: readonly DirectiveExample[];
  /** Editor snippet (TextMate/LSP snippet syntax) for the preferred form. */
  snippet?: string;
  /** Extra semantic checks beyond the schemas. */
  validate?: (node: Directive, context: DirectiveValidationContext) => void;
}

export function defineDirective<T extends DirectiveSpec>(spec: T): T {
  return spec;
}

export function labelSpec(
  spec: DirectiveSpec,
): Required<Omit<LabelSpec, 'description'>> & { description?: string } {
  return {
    use: spec.label?.use ?? 'optional',
    model: spec.label?.model ?? 'inline',
    description: spec.label?.description,
  };
}

/**
 * An immutable set of directive specs. Later specs override earlier ones with
 * the same name, which lets plugins replace built-ins deliberately.
 */
export class DirectiveRegistry {
  private readonly byName: ReadonlyMap<string, DirectiveSpec>;

  constructor(specs: Iterable<DirectiveSpec> = []) {
    const map = new Map<string, DirectiveSpec>();
    for (const spec of specs) map.set(spec.name, spec);
    this.byName = map;
  }

  get(name: string): DirectiveSpec | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  list(): DirectiveSpec[] {
    return [...this.byName.values()];
  }

  names(): string[] {
    return [...this.byName.keys()];
  }

  /** A new registry with additional (or replacement) specs. */
  extend(specs: Iterable<DirectiveSpec>): DirectiveRegistry {
    return new DirectiveRegistry([...this.byName.values(), ...specs]);
  }

  /** The closest known name for a misspelt directive, preferring ones that accept `form`. */
  suggest(name: string, form?: DirectiveForm): string | null {
    const all = this.list();
    const preferred = form
      ? all.filter((spec) => spec.forms.includes(form)).map((spec) => spec.name)
      : [];
    return (
      closest(name, preferred) ??
      closest(
        name,
        all.map((spec) => spec.name),
      )
    );
  }

  /** The content model used to parse the body of a container directive named `name`. */
  contentModel(name: string): ContentModel {
    return this.byName.get(name)?.content ?? 'flow';
  }

  labelModel(name: string): 'inline' | 'raw' {
    return this.byName.get(name)?.label?.model ?? 'inline';
  }
}
