import { CALLOUT_TYPES, type CalloutType, type Directive } from '@markup-lang/core';
import { renderChart } from './chart.ts';
import { escapeHtml } from './escape.ts';
import type { HtmlComponent, HtmlContext } from './render.ts';

const ICON_PATHS: Record<CalloutType, string> = {
  note: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  tip: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  important: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  caution: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M12 8v4M12 16h.01"/>',
};

function icon(paths: string): string {
  return `<svg class="mu-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function callout(type: CalloutType): HtmlComponent {
  const defaultTitle = type[0]!.toUpperCase() + type.slice(1);
  return (node, ctx) => {
    const title = ctx.label(node) || defaultTitle;
    const head = `${icon(ICON_PATHS[type])}<span>${title}</span>`;
    const body = `<div class="mu-callout-body">\n${ctx.body(node)}</div>`;
    if (ctx.props(node).collapsible === true) {
      return `<details${ctx.rootAttributes(node, ['mu-callout', `mu-callout-${type}`])}><summary class="mu-callout-title">${head}</summary>${body}</details>\n`;
    }
    return `<aside${ctx.rootAttributes(node, ['mu-callout', `mu-callout-${type}`], { role: 'note' })}><p class="mu-callout-title">${head}</p>${body}</aside>\n`;
  };
}

const card: HtmlComponent = (node, ctx) => {
  const props = ctx.props(node);
  const label = ctx.label(node);
  const href = typeof props.href === 'string' ? ctx.safeUrl(props.href) : null;
  const iconText = typeof props.icon === 'string' ? `<span class="mu-card-icon" aria-hidden="true">${escapeHtml(props.icon)}</span>` : '';
  const title = label ? (href ? `<a href="${escapeHtml(href)}">${label}</a>` : label) : '';
  const head = title || iconText ? `<p class="mu-card-title">${iconText}${title}</p>` : '';
  return `<div${ctx.rootAttributes(node, ['mu-card'])}>${head}<div class="mu-card-body">\n${ctx.body(node)}</div></div>\n`;
};

const columns: HtmlComponent = (node, ctx) => {
  const props = ctx.props(node);
  return `<div${ctx.rootAttributes(node, ['mu-columns'], { 'data-gap': String(props.gap), 'data-align': String(props.align) })}>\n${ctx.body(node)}</div>\n`;
};

const column: HtmlComponent = (node, ctx) => {
  const span = Number(ctx.props(node).span);
  const style = Number.isInteger(span) && span > 1 && span <= 12 ? ` style="--mu-span:${span}"` : '';
  return `<div${ctx.rootAttributes(node, ['mu-column'])}${style}>\n${ctx.body(node)}</div>\n`;
};

const tabs: HtmlComponent = (node, ctx) => {
  if (node.type !== 'containerDirective' || node.body.kind !== 'flow') return '';
  const group = ctx.uniqueId('mu-tabs');
  const children = node.body.children;
  const panels = children.filter((c): c is Directive & { type: 'containerDirective' } => c.type === 'containerDirective' && c.name === 'tab');
  const others = children.filter((c) => !(c.type === 'containerDirective' && c.name === 'tab'));
  let selected = panels.findIndex((p) => ctx.props(p).selected === true);
  if (selected === -1) selected = 0;
  let out = `<div${ctx.rootAttributes(node, ['mu-tabs'])}>\n`;
  panels.forEach((panel, i) => {
    const id = `${group}-${i + 1}`;
    out += `<input type="radio" class="mu-tab-input" name="${group}" id="${id}"${i === selected ? ' checked' : ''}>`;
    out += `<label class="mu-tab-label" for="${id}">${ctx.label(panel) || `Tab ${i + 1}`}</label>`;
    out += `<div${ctx.rootAttributes(panel, ['mu-tab-panel'])}>\n${ctx.body(panel)}</div>\n`;
  });
  out += '</div>\n';
  return out + ctx.blocks(others);
};

/** A `tab` outside `tabs` still shows its content. */
const tab: HtmlComponent = (node, ctx) =>
  `<div${ctx.rootAttributes(node, ['mu-tab-panel', 'mu-tab-orphan'])}><p class="mu-tab-orphan-title">${ctx.label(node)}</p>\n${ctx.body(node)}</div>\n`;

const details: HtmlComponent = (node, ctx) => {
  const open = ctx.props(node).open === true;
  return `<details${ctx.rootAttributes(node, ['mu-details'], { open })}><summary>${ctx.label(node) || 'Details'}</summary><div class="mu-details-body">\n${ctx.body(node)}</div></details>\n`;
};

const figure: HtmlComponent = (node, ctx) => {
  const caption = ctx.label(node);
  return `<figure${ctx.rootAttributes(node, ['mu-figure'], { 'data-align': String(ctx.props(node).align) })}>\n${ctx.body(node)}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>\n`;
};

const toc: HtmlComponent = (node, ctx) => {
  const props = ctx.props(node);
  const from = Number(props.from) || 2;
  const depth = Number(props.depth) || 3;
  const headings = ctx.headings().filter((h) => h.depth >= from && h.depth <= depth && h.id);
  const title = ctx.label(node);
  let out = `<nav${ctx.rootAttributes(node, ['mu-toc'], { 'aria-label': ctx.labelText(node) || 'Table of contents' })}>`;
  if (title) out += `<p class="mu-toc-title">${title}</p>`;
  if (headings.length === 0) return `${out}</nav>\n`;
  // Build a nested list; levels deeper than the previous heading open a sublist.
  const stack: number[] = [];
  for (const h of headings) {
    if (stack.length === 0) {
      out += '<ul>';
      stack.push(h.depth);
    } else if (h.depth > stack[stack.length - 1]!) {
      out += '<ul>';
      stack.push(h.depth);
    } else {
      while (stack.length > 1 && h.depth < stack[stack.length - 1]!) {
        out += '</li></ul>';
        stack.pop();
      }
      out += '</li>';
    }
    out += `<li><a href="#${escapeHtml(encodeURIComponent(h.id))}">${h.html}</a>`;
  }
  while (stack.length > 0) {
    out += '</li></ul>';
    stack.pop();
  }
  return `${out}</nav>\n`;
};

const progress: HtmlComponent = (node, ctx) => {
  const props = ctx.props(node);
  const max = typeof props.max === 'number' && props.max > 0 ? props.max : 100;
  const value = typeof props.value === 'number' ? Math.min(Math.max(props.value, 0), max) : 0;
  const percent = Math.round((value / max) * 1000) / 10;
  const tag = node.type === 'inlineDirective' ? 'span' : 'div';
  const label = ctx.label(node);
  return (
    `<${tag}${ctx.rootAttributes(node, ['mu-progress'], { 'data-variant': String(props.variant) })}>` +
    (label ? `<span class="mu-progress-label">${label}</span>` : '') +
    `<span class="mu-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"${label ? ` aria-label="${escapeHtml(ctx.labelText(node))}"` : ''}><span class="mu-progress-bar" style="width:${percent}%"></span></span>` +
    `<span class="mu-progress-value">${percent}%</span></${tag}>${tag === 'div' ? '\n' : ''}`
  );
};

const badge: HtmlComponent = (node, ctx) =>
  `<span${ctx.rootAttributes(node, ['mu-badge'], { 'data-variant': String(ctx.props(node).variant) })}>${ctx.label(node)}</span>`;

const kbd: HtmlComponent = (node, ctx) => {
  const raw = node.rawLabel ?? '';
  // `Ctrl++` means Ctrl and the plus key.
  const keys = raw.split(/\s*\+\s*(?=.)/).filter((k) => k.length > 0);
  return `<kbd${ctx.rootAttributes(node, ['mu-kbd'])}>${keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join('+')}</kbd>`;
};

const abbr: HtmlComponent = (node, ctx) => {
  const title = ctx.props(node).title;
  return `<abbr${ctx.rootAttributes(node, [], { title: typeof title === 'string' ? title : null })}>${ctx.label(node)}</abbr>`;
};

const chart: HtmlComponent = (node, ctx: HtmlContext) => renderChart(node, ctx);

export const BUILTIN_COMPONENTS: Record<string, HtmlComponent> = {
  ...Object.fromEntries(CALLOUT_TYPES.map((type) => [type, callout(type)])),
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
};
