import { describeType, isRequired, labelSpec, type DirectiveRegistry, type DirectiveSpec } from '@markup-lang/core';

const FORM = { container: ':::', leaf: '::', inline: ':' } as const;
const CATEGORY_TITLES: Record<string, string> = {
  callout: 'Callouts',
  layout: 'Layout',
  content: 'Content',
  data: 'Data',
  navigation: 'Navigation',
  inline: 'Inline',
};

/**
 * A component reference generated from the registry — the single source for the
 * docs page, the VS Code reference view and `markup components`.
 *
 * With `live: true` every example is followed by its rendered result (MarkUP
 * output); otherwise the result is plain Markdown that GitHub can display.
 */
export function componentReference(registry: DirectiveRegistry, options: { live?: boolean; title?: string } = {}): string {
  const groups = new Map<string, DirectiveSpec[]>();
  for (const spec of registry.list()) {
    const key = spec.category ?? 'other';
    groups.set(key, [...(groups.get(key) ?? []), spec]);
  }
  let out = `# ${options.title ?? 'Component reference'}\n\n`;
  out += 'Every component below is available in any MarkUP document. Plugins can add more.\n\n';
  for (const [category, specs] of groups) {
    out += `## ${CATEGORY_TITLES[category] ?? category[0]!.toUpperCase() + category.slice(1)}\n\n`;
    for (const spec of specs) out += section(spec, !!options.live);
  }
  return out;
}

function section(spec: DirectiveSpec, live: boolean): string {
  const forms = spec.forms.map((f) => `\`${FORM[f]}${spec.name}\``).join(', ');
  let out = `### ${spec.name}\n\n${spec.description}\n\n**Syntax:** ${forms}`;
  if (spec.content && spec.content !== 'flow') out += ` · body: ${spec.content === 'data' ? 'MarkUP Data' : 'raw text'}`;
  out += '\n\n';
  const label = labelSpec(spec);
  if (label.use !== 'none') out += `**Label** (${label.use}): ${label.description ?? 'text'}\n\n`;
  const attrs = Object.entries(spec.attributes ?? {});
  if (attrs.length) {
    out += '| Attribute | Type | Default | Description |\n|---|---|---|---|\n';
    for (const [key, schema] of attrs) {
      const def = schema.default !== undefined ? `\`${String(schema.default)}\`` : isRequired(schema) ? 'required' : '—';
      out += `| \`${key}\` | ${describeType(schema).replace(/\|/g, '\\|')} | ${def} | ${schema.description ?? ''} |\n`;
    }
    out += '\n';
  }
  if (spec.allowedParents) out += `Must be placed directly inside ${spec.allowedParents.map((p) => `\`${p}\``).join(' or ')}.\n\n`;
  if (spec.allowedChildren) out += `May only contain ${spec.allowedChildren.map((p) => `\`${p}\``).join(', ')}.\n\n`;
  for (const example of spec.examples ?? []) {
    if (example.title) out += `**${example.title}**\n\n`;
    const fence = example.source.includes('```') ? '~~~~' : '```';
    out += `${fence}markup\n${example.source}\n${fence}\n\n`;
    if (live) out += `${example.source}\n\n`;
  }
  return out;
}
