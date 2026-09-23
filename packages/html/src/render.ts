import {
  collectAnchors,
  coerceAttribute,
  createRegistry,
  inlineText,
  isSafeUrl,
  toPlainData,
  visit,
  type Attributes,
  type Block,
  type Directive,
  type DirectiveRegistry,
  type Document,
  type FootnoteDefinition,
  type Inline,
  type ListItem,
  type MarkupPlugin,
  type Node,
  type PlainData,
} from '@markup-lang/core';
import { BUILTIN_COMPONENTS } from './components.ts';
import { attributes, escapeHtml } from './escape.ts';

/** Renders one directive to HTML. */
export type HtmlComponent = (node: Directive, ctx: HtmlContext) => string;

export interface HtmlOptions {
  /** Plugins: their `renderers.html` components are used, and their specs extend the registry. */
  plugins?: readonly MarkupPlugin[];
  /** Extra or replacement components, by directive name. */
  components?: Readonly<Record<string, HtmlComponent>>;
  /** Registry used to coerce attributes (defaults to built-ins + plugins). */
  registry?: DirectiveRegistry;
  /** Add `data-line` attributes to block elements (for editor scroll sync). */
  sourcePositions?: boolean;
  /** Add a `#` anchor link to headings. Default true. */
  headingAnchors?: boolean;
  /** Syntax highlighter for fenced code; return HTML, or null to fall back to escaped text. */
  highlight?: (code: string, lang: string | null) => string | null;
  /** Rewrites link and image URLs (after the safety check), e.g. `page.markup` → `page.html`. */
  rewriteUrl?: (url: string, kind: 'link' | 'image') => string;
}

export interface HtmlContext {
  readonly document: Document;
  readonly options: HtmlOptions;
  readonly registry: DirectiveRegistry;
  blocks(nodes: readonly Block[]): string;
  inlines(nodes: readonly Inline[]): string;
  /** Rendered label content, or '' when there is none. */
  label(node: Directive): string;
  /** Plain-text label. */
  labelText(node: Directive): string;
  /** Children of a container directive (flow body), rendered. */
  body(node: Directive): string;
  /** Typed attribute values: coerced with the spec's schemas, defaults applied. */
  props(node: Directive): Record<string, unknown>;
  /** Plain data of a `data` body merged over the typed attributes. */
  data(node: Directive): Record<string, PlainData | unknown>;
  /** Common attributes for the root element: id, classes, data-line. */
  rootAttributes(
    node: Node,
    classes: string[],
    extra?: Record<string, string | number | boolean | null | undefined>,
  ): string;
  /** A document-unique id with the given prefix. */
  uniqueId(prefix: string): string;
  /** Headings with their ids, in document order. */
  headings(): { id: string; depth: number; text: string; html: string }[];
  escape(text: string): string;
  safeUrl(url: string, kind?: 'link' | 'image'): string | null;
}

export function renderHtml(document: Document, options: HtmlOptions = {}): string {
  return new HtmlRenderer(document, options).render();
}

class HtmlRenderer implements HtmlContext {
  readonly document: Document;
  readonly options: HtmlOptions;
  readonly registry: DirectiveRegistry;
  private readonly components: Record<string, HtmlComponent>;
  private readonly headingIds: Map<Node, string>;
  private readonly footnoteDefs = new Map<string, FootnoteDefinition>();
  /** Footnote identifiers in order of first reference, with reference counts. */
  private readonly footnoteOrder = new Map<string, { number: number; refs: number }>();
  private readonly ids = new Map<string, number>();

  constructor(document: Document, options: HtmlOptions) {
    this.document = document;
    this.options = options;
    const plugins = options.plugins ?? [];
    this.registry = options.registry ?? createRegistry(plugins);
    this.components = { ...BUILTIN_COMPONENTS };
    for (const plugin of plugins)
      Object.assign(
        this.components,
        (plugin.renderers?.html ?? {}) as Record<string, HtmlComponent>,
      );
    Object.assign(this.components, options.components ?? {});
    this.headingIds = collectAnchors(document).headingIds;
    visit(document, (node) => {
      if (node.type === 'footnoteDefinition' && !this.footnoteDefs.has(node.identifier))
        this.footnoteDefs.set(node.identifier, node);
    });
  }

  render(): string {
    const body = this.blocks(this.document.children);
    return body + this.renderFootnotes();
  }

  // -------------------------------------------------------------------------
  // Blocks

  blocks(nodes: readonly Block[]): string {
    let out = '';
    for (const node of nodes) out += this.block(node);
    return out;
  }

  private block(node: Block): string {
    const line = this.lineAttr(node);
    switch (node.type) {
      case 'paragraph':
        return `<p${line}>${this.inlines(node.children)}</p>\n`;
      case 'heading': {
        const id = this.headingIds.get(node) ?? '';
        const content = this.inlines(node.children);
        const anchor =
          this.options.headingAnchors === false || !id
            ? ''
            : `<a class="mu-anchor" href="#${escapeHtml(encodeURIComponent(id))}" aria-hidden="true" tabindex="-1">#</a>`;
        return `<h${node.depth}${attributes({ id: id || null, class: node.attributes?.classes.join(' ') || null, ...extraData(node.attributes) })}${line}>${content}${anchor}</h${node.depth}>\n`;
      }
      case 'thematicBreak':
        return `<hr${line}>\n`;
      case 'blockquote':
        return `<blockquote${line}>\n${this.blocks(node.children)}</blockquote>\n`;
      case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        const start =
          node.ordered && node.start !== null && node.start !== 1 ? ` start="${node.start}"` : '';
        const tasks = node.children.some((item) => item.checked !== null);
        return `<${tag}${start}${tasks ? ' class="mu-tasks"' : ''}${line}>\n${node.children.map((item) => this.listItem(item, node.spread)).join('')}</${tag}>\n`;
      }
      case 'code':
        return this.code(node, line);
      case 'table':
        return this.table(node, line);
      case 'comment':
      case 'definition':
      case 'footnoteDefinition':
        return '';
      case 'containerDirective':
      case 'leafDirective':
        return this.directive(node);
    }
  }

  private listItem(item: ListItem, spread: boolean): string {
    let content = '';
    for (const child of item.children) {
      // Tight lists render paragraph content without <p>.
      content +=
        !spread && child.type === 'paragraph'
          ? this.inlines(child.children)
          : this.block(child).replace(/\n$/, '');
      if (spread || child.type !== 'paragraph') content += '\n';
    }
    const checkbox =
      item.checked === null
        ? ''
        : `<input type="checkbox" disabled${item.checked ? ' checked' : ''}> `;
    const cls = item.checked === null ? '' : ' class="mu-task"';
    return `<li${cls}${this.lineAttr(item)}>${checkbox}${content.replace(/\n$/, '')}</li>\n`;
  }

  private code(node: Extract<Block, { type: 'code' }>, line: string): string {
    const lang = node.lang;
    const highlighted = this.options.highlight?.(node.value, lang) ?? null;
    const inner = highlighted ?? escapeHtml(node.value);
    const codeClass = lang ? ` class="language-${escapeHtml(lang.replace(/[^\w+#.-]/g, ''))}"` : '';
    const title = node.attributes?.values.title;
    const pre = `<pre class="mu-code"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}${title ? '' : line}><code${codeClass}>${inner}${node.value ? '\n' : ''}</code></pre>`;
    if (typeof title === 'string') {
      return `<figure class="mu-code-block"${line}><figcaption>${escapeHtml(title)}</figcaption>${pre}</figure>\n`;
    }
    return `${pre}\n`;
  }

  private table(node: Extract<Block, { type: 'table' }>, line: string): string {
    const head = node.children.filter((row) => row.head);
    const body = node.children.filter((row) => !row.head);
    const row = (r: (typeof node.children)[number], cell: 'th' | 'td') =>
      `<tr>${r.children
        .map((c, i) => {
          const align = node.align[i];
          return `<${cell}${align ? ` style="text-align:${align}"` : ''}>${this.inlines(c.children)}</${cell}>`;
        })
        .join('')}</tr>\n`;
    return (
      `<div class="mu-table"${line}><table>\n` +
      (head.length ? `<thead>\n${head.map((r) => row(r, 'th')).join('')}</thead>\n` : '') +
      (body.length ? `<tbody>\n${body.map((r) => row(r, 'td')).join('')}</tbody>\n` : '') +
      `</table></div>\n`
    );
  }

  private directive(node: Directive): string {
    const component = Object.hasOwn(this.components, node.name)
      ? this.components[node.name]
      : undefined;
    if (component && this.registry.get(node.name)?.forms.includes(formOf(node)) !== false) {
      try {
        return component(node, this);
      } catch (error) {
        return `<div class="mu-error"${this.lineAttr(node)}>${escapeHtml(`Component “${node.name}” failed: ${error instanceof Error ? error.message : String(error)}`)}</div>\n`;
      }
    }
    return this.fallback(node);
  }

  /** Unknown components keep their content so nothing is lost. */
  private fallback(node: Directive): string {
    const label = this.label(node);
    const attrs = this.rootAttributes(node, ['mu-directive'], { 'data-directive': node.name });
    if (node.type === 'inlineDirective') return `<span${attrs}>${label}</span>`;
    const head = label ? `<div class="mu-directive-label">${label}</div>` : '';
    return `<div${attrs}>${head}${node.type === 'containerDirective' ? this.body(node) : ''}</div>\n`;
  }

  // -------------------------------------------------------------------------
  // Inlines

  inlines(nodes: readonly Inline[]): string {
    let out = '';
    for (const node of nodes) out += this.inline(node);
    return out;
  }

  private inline(node: Inline): string {
    switch (node.type) {
      case 'text':
        return escapeHtml(node.value);
      case 'emphasis':
        return `<em>${this.inlines(node.children)}</em>`;
      case 'strong':
        return `<strong>${this.inlines(node.children)}</strong>`;
      case 'delete':
        return `<del>${this.inlines(node.children)}</del>`;
      case 'inlineCode':
        return `<code>${escapeHtml(node.value)}</code>`;
      case 'break':
        return '<br>\n';
      case 'comment':
        return '';
      case 'link': {
        const href = this.safeUrl(node.url);
        const content = this.inlines(node.children);
        if (href === null) return `<span class="mu-unsafe-link">${content}</span>`;
        return `<a${attributes({ href, title: node.title })}>${content}</a>`;
      }
      case 'image': {
        const src = this.safeUrl(node.url, 'image');
        if (src === null) return `<span class="mu-unsafe-image">${escapeHtml(node.alt)}</span>`;
        const a = node.attributes;
        return `<img${attributes({
          src,
          alt: node.alt,
          title: node.title,
          id: a?.id ?? null,
          class: a?.classes.join(' ') || null,
          width: dimension(a?.values.width),
          height: dimension(a?.values.height),
          loading: 'lazy',
        })}>`;
      }
      case 'footnoteReference': {
        const def = this.footnoteDefs.get(node.identifier);
        if (!def) return escapeHtml(`[^${node.label}]`);
        let entry = this.footnoteOrder.get(node.identifier);
        if (!entry) {
          entry = { number: this.footnoteOrder.size + 1, refs: 0 };
          this.footnoteOrder.set(node.identifier, entry);
        }
        entry.refs++;
        const refId =
          entry.refs === 1 ? `fnref-${entry.number}` : `fnref-${entry.number}-${entry.refs}`;
        return `<sup class="mu-fnref"><a href="#fn-${entry.number}" id="${refId}">${entry.number}</a></sup>`;
      }
      case 'inlineDirective':
        return this.directive(node);
    }
  }

  private renderFootnotes(): string {
    if (this.footnoteOrder.size === 0) return '';
    let out = '<section class="mu-footnotes" role="doc-endnotes">\n<hr>\n<ol>\n';
    // Footnote bodies may reference further footnotes, which extends the order while rendering.
    for (const [identifier, entry] of this.footnoteOrder) {
      const def = this.footnoteDefs.get(identifier)!;
      const backrefs = Array.from({ length: entry.refs }, (_, i) => {
        const id = i === 0 ? `fnref-${entry.number}` : `fnref-${entry.number}-${i + 1}`;
        return ` <a href="#${id}" class="mu-backref" aria-label="Back to reference">↩</a>`;
      }).join('');
      let content = this.blocks(def.children).trim();
      content = content.endsWith('</p>')
        ? `${content.slice(0, -4)}${backrefs}</p>`
        : `${content}${backrefs}`;
      out += `<li id="fn-${entry.number}">${content}</li>\n`;
    }
    return `${out}</ol>\n</section>\n`;
  }

  // -------------------------------------------------------------------------
  // Context helpers

  label(node: Directive): string {
    return node.label ? this.inlines(node.label) : '';
  }

  labelText(node: Directive): string {
    return node.label ? inlineText(node.label) : '';
  }

  body(node: Directive): string {
    return node.type === 'containerDirective' && node.body.kind === 'flow'
      ? this.blocks(node.body.children)
      : '';
  }

  props(node: Directive): Record<string, unknown> {
    const spec = this.registry.get(node.name);
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, schema] of Object.entries(spec?.attributes ?? {})) {
      if (schema.default !== undefined) out[key] = schema.default;
    }
    for (const [key, raw] of Object.entries(node.attributes?.values ?? {})) {
      const schema = spec?.attributes?.[key];
      if (!schema) {
        out[key] = raw;
        continue;
      }
      const coerced = coerceAttribute(raw, schema);
      if (coerced.ok) out[key] = coerced.value;
    }
    return out;
  }

  data(node: Directive): Record<string, unknown> {
    const out = this.props(node);
    if (node.type === 'containerDirective' && node.body.kind === 'data') {
      const value = toPlainData(node.body.value);
      if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(out, value);
    }
    return out;
  }

  rootAttributes(
    node: Node,
    classes: string[],
    extra: Record<string, string | number | boolean | null | undefined> = {},
  ): string {
    const a = 'attributes' in node ? (node.attributes as Attributes | null) : null;
    const allClasses = [...classes, ...(a?.classes ?? [])].join(' ');
    return (
      attributes({ id: a?.id ?? null, class: allClasses || null, ...extra }) + this.lineAttr(node)
    );
  }

  uniqueId(prefix: string): string {
    const n = (this.ids.get(prefix) ?? 0) + 1;
    this.ids.set(prefix, n);
    return `${prefix}-${n}`;
  }

  headings(): { id: string; depth: number; text: string; html: string }[] {
    const out: { id: string; depth: number; text: string; html: string }[] = [];
    visit(this.document, (node) => {
      if (node.type === 'heading') {
        out.push({
          id: this.headingIds.get(node) ?? '',
          depth: node.depth,
          text: inlineText(node.children),
          html: this.inlines(stripLinks(node.children)),
        });
        return 'skip';
      }
      return undefined;
    });
    return out;
  }

  escape(text: string): string {
    return escapeHtml(text);
  }

  safeUrl(url: string, kind: 'link' | 'image' = 'link'): string | null {
    if (!isSafeUrl(url, kind)) return null;
    const rewritten = this.options.rewriteUrl?.(url, kind) ?? url;
    return isSafeUrl(rewritten, kind) ? rewritten : null;
  }

  private lineAttr(node: Node): string {
    if (!this.options.sourcePositions) return '';
    return ` data-line="${node.position.start.line}" data-line-end="${node.position.end.line}"`;
  }
}

function formOf(node: Directive): 'container' | 'leaf' | 'inline' {
  return node.type === 'containerDirective'
    ? 'container'
    : node.type === 'leafDirective'
      ? 'leaf'
      : 'inline';
}

/** Image dimensions: a number, optionally in px or %; anything else is dropped. */
function dimension(value: string | true | undefined): string | null {
  return typeof value === 'string' && /^\d{1,5}(\.\d{1,3})?(px|%)?$/.test(value.trim())
    ? value.trim()
    : null;
}

/** Extra heading attributes become `data-*` attributes. */
function extraData(attrs: Attributes | null): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const [key, value] of Object.entries(attrs?.values ?? {}))
    out[`data-${key.replace(/^data-/, '')}`] = value;
  return out;
}

/** Headings inside a table of contents must not contain nested links. */
function stripLinks(nodes: readonly Inline[]): Inline[] {
  return nodes.flatMap((node) => (node.type === 'link' ? stripLinks(node.children) : [node]));
}
