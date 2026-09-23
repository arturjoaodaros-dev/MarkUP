import {
  describeType,
  isRequired,
  labelSpec,
  type DirectiveSpec,
  type Schema,
} from '@markup-lang/core';

const FORM_SYNTAX = { container: ':::', leaf: '::', inline: ':' } as const;

/** Markdown documentation for a component (hover and completion). */
export function directiveDocs(spec: DirectiveSpec): string {
  const forms = spec.forms.map((f) => `\`${FORM_SYNTAX[f]}${spec.name}\``).join(' · ');
  let md = `**${spec.name}** — ${forms}\n\n${spec.description}\n`;
  const label = labelSpec(spec);
  if (label.use !== 'none')
    md += `\n**Label** (${label.use})${label.description ? `: ${label.description}` : ''}\n`;
  const attrs = Object.entries(spec.attributes ?? {});
  if (attrs.length) {
    md += '\n| Attribute | Type | Default |\n|---|---|---|\n';
    for (const [key, schema] of attrs) {
      md += `| \`${key}\` | ${describeType(schema).replace(/\|/g, '\\|')} | ${schema.default !== undefined ? `\`${String(schema.default)}\`` : isRequired(schema) ? '*required*' : '—'} |\n`;
    }
  }
  if (spec.content === 'data') md += '\nThe body is MarkUP Data (`key: value` lines).\n';
  if (spec.allowedParents)
    md += `\nMust be placed inside ${spec.allowedParents.map((p) => `\`${p}\``).join(' or ')}.\n`;
  const example = spec.examples?.[0];
  if (example) md += `\n\`\`\`markup\n${example.source}\n\`\`\`\n`;
  return md;
}

export function attributeDocs(key: string, schema: Schema): string {
  let md = `**${key}**: \`${describeType(schema)}\``;
  if (schema.default !== undefined) md += ` (default \`${String(schema.default)}\`)`;
  else if (isRequired(schema)) md += ' — required';
  if (schema.description) md += `\n\n${schema.description}`;
  if (schema.kind === 'enum' && schema.valueDescriptions) {
    md += `\n\n${schema.values.map((v) => `- \`${v}\`${schema.valueDescriptions?.[v] ? ` — ${schema.valueDescriptions[v]}` : ''}`).join('\n')}`;
  }
  return md;
}

export const schemaDocs = attributeDocs;
