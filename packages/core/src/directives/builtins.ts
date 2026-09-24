/**
 * Built-in components.
 *
 * These specs are the language-level definition of every component that ships
 * with MarkUP. Renderers implement them separately (see `@markup-lang/html`).
 */
import { getEntry, type DataNode } from '../data/types.ts';
import { s, type Schema } from '../schema/schema.ts';
import { defineDirective, DirectiveRegistry, type DirectiveSpec } from './spec.ts';

// ---------------------------------------------------------------------------
// Callouts

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

const CALLOUT_DESCRIPTIONS: Record<CalloutType, string> = {
  note: 'Useful information that readers should know, even when skimming.',
  tip: 'Helpful advice for doing things better or more easily.',
  important: 'Key information readers need to achieve their goal.',
  warning: 'Urgent information that needs immediate attention to avoid problems.',
  caution: 'Advises about risks or negative outcomes of certain actions.',
};

function callout(type: CalloutType): DirectiveSpec {
  const title = type[0]!.toUpperCase() + type.slice(1);
  return defineDirective({
    name: type,
    forms: ['container'],
    category: 'callout',
    description: `${title} callout — ${CALLOUT_DESCRIPTIONS[type][0]!.toLowerCase()}${CALLOUT_DESCRIPTIONS[type].slice(1)}`,
    label: { use: 'optional', description: `Custom title. Defaults to “${title}”.` },
    attributes: {
      collapsible: s.boolean({
        optional: true,
        description: 'Render the callout collapsed behind its title.',
      }),
    },
    examples: [{ source: `:::${type}\nThe body is regular **MarkUP**.\n:::` }],
    snippet: `:::${type}\n\${1:Text}\n:::`,
  });
}

// ---------------------------------------------------------------------------
// Layout and content

const card = defineDirective({
  name: 'card',
  forms: ['container'],
  category: 'layout',
  description:
    'A bordered surface that groups related content. Several cards in a row inside `columns` make a grid.',
  label: { use: 'optional', description: 'Card title.' },
  attributes: {
    href: s.string({ optional: true, description: 'Makes the title a link.', example: '/guide' }),
    icon: s.string({
      optional: true,
      description: 'A short symbol shown before the title.',
      example: '1',
    }),
  },
  examples: [
    {
      source:
        ':::card[Installation]{href=installation.md}\nMarkUP needs Node.js 22.12 or newer.\n:::',
    },
  ],
  snippet: ':::card[${1:Title}]\n${2:Content}\n:::',
});

const columns = defineDirective({
  name: 'columns',
  forms: ['container'],
  category: 'layout',
  description: 'Lays out its `column` children side by side. Columns stack on narrow screens.',
  label: { use: 'none' },
  attributes: {
    gap: s.enum(['none', 'small', 'medium', 'large'], {
      default: 'medium',
      description: 'Space between columns.',
    }),
    align: s.enum(['start', 'center', 'end', 'stretch'], {
      default: 'stretch',
      description: 'Vertical alignment of the columns.',
    }),
  },
  allowedChildren: ['column'],
  examples: [
    {
      source: '::::columns\n:::column\nLeft\n:::\n:::column\nRight\n:::\n::::',
    },
  ],
  snippet: '::::columns\n:::column\n${1:Left}\n:::\n:::column\n${2:Right}\n:::\n::::',
});

const column = defineDirective({
  name: 'column',
  forms: ['container'],
  category: 'layout',
  description: 'One column of a `columns` layout.',
  label: { use: 'none' },
  attributes: {
    span: s.number({
      integer: true,
      min: 1,
      max: 12,
      default: 1,
      description: 'Relative width compared to sibling columns.',
    }),
  },
  allowedParents: ['columns'],
  snippet: ':::column\n$0\n:::',
});

const tabs = defineDirective({
  name: 'tabs',
  forms: ['container'],
  category: 'layout',
  description: 'A set of tabbed panels. Each panel is a `tab` child; works without JavaScript.',
  label: { use: 'none' },
  allowedChildren: ['tab'],
  examples: [
    {
      source:
        '::::tabs\n:::tab[Command]\n```sh\nmarkup build docs --out site\n```\n:::\n:::tab[Configuration]\n```json\n{ "out": "site" }\n```\n:::\n::::',
    },
  ],
  snippet: '::::tabs\n:::tab[${1:First}]\n${2}\n:::\n:::tab[${3:Second}]\n${4}\n:::\n::::',
});

const tab = defineDirective({
  name: 'tab',
  forms: ['container'],
  category: 'layout',
  description: 'One panel of a `tabs` group. The label is the tab title.',
  label: { use: 'required', description: 'Tab title.' },
  attributes: {
    selected: s.boolean({
      optional: true,
      description: 'Select this tab initially instead of the first one.',
    }),
  },
  allowedParents: ['tabs'],
  snippet: ':::tab[${1:Title}]\n$0\n:::',
});

const details = defineDirective({
  name: 'details',
  forms: ['container'],
  category: 'content',
  description: 'A collapsible section. The label is the always-visible summary.',
  label: { use: 'optional', description: 'Summary text. Defaults to “Details”.' },
  attributes: {
    open: s.boolean({ optional: true, description: 'Start expanded.' }),
  },
  examples: [
    {
      source: ':::details[How does it work?]\nThe body is hidden until the reader expands it.\n:::',
    },
  ],
  snippet: ':::details[${1:Summary}]\n${2:Content}\n:::',
});

const figure = defineDirective({
  name: 'figure',
  forms: ['container'],
  category: 'content',
  description:
    'Self-contained content — usually an image, diagram or code — with an optional caption.',
  label: { use: 'optional', description: 'Caption.' },
  attributes: {
    align: s.enum(['left', 'center', 'right'], {
      default: 'center',
      description: 'Horizontal alignment.',
    }),
  },
  examples: [
    { source: ':::figure[Building a folder]\n```sh\nmarkup build docs --out site\n```\n:::' },
  ],
  snippet: ':::figure[${1:Caption}]\n![${2:Alt text}](${3:image.png})\n:::',
});

// ---------------------------------------------------------------------------
// Data

export const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'donut'] as const;

const chartTypeSchema = s.enum(CHART_TYPES, {
  default: 'bar',
  description: 'Kind of chart.',
  valueDescriptions: {
    bar: 'Vertical bars; grouped or stacked when there are several series.',
    line: 'Lines through each series’ points.',
    area: 'Filled line chart.',
    pie: 'Proportions of a whole. Uses the first series only.',
    donut: 'A pie chart with a hole. Uses the first series only.',
  },
});

const chartCommon: Record<string, Schema> = {
  type: chartTypeSchema,
  title: s.string({ optional: true, description: 'Title shown above the chart.' }),
  unit: s.string({
    optional: true,
    description: 'Unit appended to values, e.g. `%` or ` ms`.',
    example: '%',
  }),
  height: s.number({ min: 120, max: 1200, default: 280, description: 'Height in pixels.' }),
  stacked: s.boolean({
    optional: true,
    description: 'Stack series instead of grouping them (bar and area).',
  }),
  legend: s.boolean({
    optional: true,
    description: 'Show the legend. Defaults to true when there are several series.',
  }),
};

const chartData = s.object(
  {
    ...chartCommon,
    data: s.record(s.number(), {
      optional: true,
      minEntries: 1,
      description: 'A single series as `label: value` pairs.',
    }),
    labels: s.array(s.union([s.string(), s.number()]), {
      optional: true,
      minItems: 1,
      description: 'Category labels for `series`.',
    }),
    series: s.array(
      s.object({
        name: s.string({ description: 'Series name, shown in the legend.' }),
        values: s.array(s.number(), { minItems: 1, description: 'One value per label.' }),
        color: s.string({
          optional: true,
          pattern: /^#(?:[0-9a-fA-F]{3}){1,2}$/,
          patternLabel: 'a hex colour such as `#4f46e5`',
          description: 'Override the series colour.',
        }),
      }),
      {
        optional: true,
        minItems: 1,
        description: 'Several named series; use together with `labels`.',
      },
    ),
  },
  { description: 'Chart configuration and data.' },
);

const chart = defineDirective({
  name: 'chart',
  forms: ['container'],
  category: 'data',
  description:
    'A chart rendered to static SVG. The body is MarkUP Data: either `data` (one series of `label: value` pairs) or `labels` plus `series`.',
  label: { use: 'optional', description: 'Chart title (same as the `title` key).' },
  attributes: chartCommon,
  content: 'data',
  data: chartData,
  bodyRequired: true,
  examples: [
    {
      title: 'Single series',
      source:
        ':::chart\ntype: bar\ntitle: Favourite languages\ndata:\n  Python: 80\n  JavaScript: 60\n  Rust: 40\n:::',
    },
    {
      title: 'Several series',
      source:
        ':::chart{type=line unit=k}\nlabels: [Q1, Q2, Q3, Q4]\nseries:\n  - name: 2025\n    values: [12, 18, 15, 24]\n  - name: 2026\n    values: [16, 22, 27, 31]\n:::',
    },
  ],
  snippet:
    ':::chart\ntype: ${1|bar,line,area,pie,donut|}\ndata:\n  ${2:A}: ${3:10}\n  ${4:B}: ${5:20}\n:::',
  validate(node, ctx) {
    if (node.type !== 'containerDirective' || node.body.kind !== 'data') return;
    const body = node.body.value;
    if (body?.kind !== 'map') return; // Schema validation reports the shape.
    const data = getEntry(body, 'data');
    const labels = getEntry(body, 'labels');
    const series = getEntry(body, 'series');
    if (!data && !series) {
      ctx.report(
        'MU2010',
        node.body.range,
        'A chart needs either `data` (one series) or `labels` and `series`.',
      );
      return;
    }
    if (data && series) {
      ctx.report(
        'MU2010',
        series.keyRange,
        'Use either `data` or `series`, not both; `series` is ignored.',
      );
    }
    if (series && !data) {
      if (!labels) {
        ctx.report('MU2010', series.keyRange, '`series` requires `labels`.');
        return;
      }
      const labelCount = labels.value.kind === 'seq' ? labels.value.items.length : 0;
      if (series.value.kind === 'seq') {
        for (const item of series.value.items) {
          const values = getEntry(item, 'values');
          if (values?.value.kind === 'seq' && values.value.items.length !== labelCount) {
            ctx.report(
              'MU2010',
              values.value.range,
              `Series has ${values.value.items.length} value${values.value.items.length === 1 ? '' : 's'} but there ${labelCount === 1 ? 'is 1 label' : `are ${labelCount} labels`}.`,
              { severity: 'warning' },
            );
          }
        }
        const type = effectiveString(body, node.attributes?.values.type, 'type');
        if ((type === 'pie' || type === 'donut') && series.value.items.length > 1) {
          ctx.report(
            'MU2010',
            series.keyRange,
            `A ${type} chart shows one series; only the first is used.`,
            { severity: 'warning' },
          );
        }
      }
    }
    for (const key of ['type', 'title', 'unit', 'height', 'stacked', 'legend']) {
      const entry = getEntry(body, key);
      const attribute = node.attributes?.items.find((item) => item.name === key);
      if (entry && attribute) {
        ctx.report(
          'MU2010',
          attribute.range,
          `\`${key}\` is set both as an attribute and in the body; the body wins.`,
          {
            severity: 'warning',
            related: [{ range: entry.keyRange, message: 'Body value.' }],
          },
        );
      }
    }
  },
});

function effectiveString(
  body: DataNode,
  attribute: string | true | undefined,
  key: string,
): string | undefined {
  const entry = getEntry(body, key);
  if (entry?.value.kind === 'scalar' && typeof entry.value.value === 'string')
    return entry.value.value;
  return typeof attribute === 'string' ? attribute : undefined;
}

// ---------------------------------------------------------------------------
// Leaf blocks

const toc = defineDirective({
  name: 'toc',
  forms: ['leaf'],
  category: 'navigation',
  description: 'A table of contents generated from the document’s headings.',
  label: { use: 'optional', description: 'Title shown above the list.' },
  attributes: {
    depth: s.number({
      integer: true,
      min: 1,
      max: 6,
      default: 3,
      description: 'Deepest heading level to include.',
    }),
    from: s.number({
      integer: true,
      min: 1,
      max: 6,
      default: 2,
      description: 'Shallowest heading level to include.',
    }),
  },
  examples: [{ source: '::toc[On this page]{depth=3}' }],
  snippet: '::toc{depth=${1:3}}',
  validate(node, ctx) {
    const from = Number(node.attributes?.values.from ?? 2);
    const depth = Number(node.attributes?.values.depth ?? 3);
    if (Number.isFinite(from) && Number.isFinite(depth) && from > depth) {
      ctx.report(
        'MU2004',
        node.attributes?.range ?? node.position,
        `\`from\` (${from}) is greater than \`depth\` (${depth}); the table of contents would be empty.`,
      );
    }
  },
});

const progress = defineDirective({
  name: 'progress',
  forms: ['leaf', 'inline'],
  category: 'content',
  description: 'A progress bar. Use it as a block (`::progress`) or inline (`:progress`).',
  label: { use: 'optional', description: 'Text shown next to the bar.' },
  attributes: {
    value: s.number({ description: 'Current value.' }),
    max: s.number({ min: 0, default: 100, description: 'Value that represents completion.' }),
    variant: s.enum(['default', 'success', 'warning', 'danger'], {
      default: 'default',
      description: 'Colour.',
    }),
  },
  examples: [{ source: '::progress[Translation]{value=72}' }],
  snippet: '::progress[${1:Label}]{value=${2:50}}',
  validate(node, ctx) {
    const value = Number(node.attributes?.values.value);
    const max = Number(node.attributes?.values.max ?? 100);
    if (Number.isFinite(value) && Number.isFinite(max) && (value < 0 || value > max)) {
      ctx.report(
        'MU2004',
        node.attributes?.range ?? node.position,
        `\`value\` (${value}) should be between 0 and \`max\` (${max}).`,
        {
          severity: 'warning',
        },
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Inline

const badge = defineDirective({
  name: 'badge',
  forms: ['inline'],
  category: 'inline',
  description: 'A small status label.',
  label: { use: 'required', description: 'Badge text.' },
  attributes: {
    variant: s.enum(['neutral', 'info', 'success', 'warning', 'danger'], {
      default: 'neutral',
      description: 'Colour.',
    }),
  },
  examples: [{ source: 'Status: :badge[stable]{variant=success}' }],
  snippet: ':badge[${1:Text}]{variant=${2|neutral,info,success,warning,danger|}}',
});

const kbd = defineDirective({
  name: 'kbd',
  forms: ['inline'],
  category: 'inline',
  description: 'A keyboard shortcut. Keys separated by `+` are rendered individually.',
  label: { use: 'required', model: 'raw', description: 'Keys, e.g. `Ctrl+Shift+P`.' },
  examples: [{ source: 'Press :kbd[Ctrl+S] to save.' }],
  snippet: ':kbd[${1:Ctrl+S}]',
});

const abbr = defineDirective({
  name: 'abbr',
  forms: ['inline'],
  category: 'inline',
  description: 'An abbreviation with its expansion shown on hover.',
  label: { use: 'required', description: 'The abbreviation.' },
  attributes: {
    title: s.string({ minLength: 1, description: 'The expanded form.' }),
  },
  examples: [{ source: ':abbr[AST]{title="Abstract syntax tree"}' }],
  snippet: ':abbr[${1:ABBR}]{title="${2:Expansion}"}',
});

export const BUILTIN_DIRECTIVES: readonly DirectiveSpec[] = [
  ...CALLOUT_TYPES.map(callout),
  card,
  columns,
  column,
  tabs,
  tab,
  details,
  figure,
  chart,
  toc,
  progress,
  badge,
  kbd,
  abbr,
];

export const builtinRegistry = new DirectiveRegistry(BUILTIN_DIRECTIVES);
