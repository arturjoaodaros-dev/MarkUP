/**
 * `chart` → static, accessible SVG. No JavaScript: tooltips use SVG <title>, and a
 * visually hidden table carries the data for screen readers.
 */
import type { Directive } from '@markup-lang/core';
import { escapeHtml } from './escape.ts';
import type { HtmlContext } from './render.ts';

type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut';

interface Series {
  name: string;
  values: number[];
  color: string | null;
}

export interface ChartModel {
  type: ChartType;
  title: string;
  unit: string;
  height: number;
  stacked: boolean;
  legend: boolean;
  labels: string[];
  series: Series[];
}

const WIDTH = 640;
const HEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const TYPES: readonly ChartType[] = ['bar', 'line', 'area', 'pie', 'donut'];

/** Normalises chart props and body into a model, or null when there is nothing to draw. */
export function chartModel(props: Record<string, unknown>, fallbackTitle: string): ChartModel | null {
  const type = TYPES.includes(props.type as ChartType) ? (props.type as ChartType) : 'bar';
  let labels: string[] = [];
  let series: Series[] = [];
  const data = props.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
    labels = entries.map(([k]) => k);
    series = [{ name: typeof props.title === 'string' ? props.title : fallbackTitle || 'Value', values: entries.map(([, v]) => v as number), color: null }];
  } else if (Array.isArray(props.series) && Array.isArray(props.labels)) {
    labels = props.labels.map((l) => String(l));
    series = props.series
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s, i) => ({
        name: typeof s.name === 'string' || typeof s.name === 'number' ? String(s.name) : `Series ${i + 1}`,
        values: labels.map((_, j) => {
          const v = Array.isArray(s.values) ? s.values[j] : undefined;
          return typeof v === 'number' && Number.isFinite(v) ? v : 0;
        }),
        color: typeof s.color === 'string' && HEX.test(s.color) ? s.color : null,
      }));
  }
  if (labels.length === 0 || series.length === 0) return null;
  if (type === 'pie' || type === 'donut') series = series.slice(0, 1);
  const height = typeof props.height === 'number' && props.height >= 120 && props.height <= 1200 ? props.height : 280;
  return {
    type,
    title: typeof props.title === 'string' ? props.title : fallbackTitle,
    unit: typeof props.unit === 'string' ? props.unit : '',
    height,
    stacked: props.stacked === true,
    legend: typeof props.legend === 'boolean' ? props.legend : series.length > 1 || type === 'pie' || type === 'donut',
    labels,
    series,
  };
}

export function renderChart(node: Directive, ctx: HtmlContext): string {
  const model = chartModel(ctx.data(node), ctx.labelText(node));
  const attrs = ctx.rootAttributes(node, ['mu-chart'], { 'data-type': model?.type ?? null });
  if (!model) return `<figure${attrs}><p class="mu-error">This chart has no data.</p></figure>\n`;
  const titleId = ctx.uniqueId('mu-chart');
  const svg = model.type === 'pie' || model.type === 'donut' ? pieSvg(model, titleId) : xySvg(model, titleId);
  const caption = model.title ? `<figcaption class="mu-chart-title">${escapeHtml(model.title)}</figcaption>` : '';
  return `<figure${attrs}>${caption}${svg}${model.legend ? legend(model) : ''}${dataTable(model)}</figure>\n`;
}

// ---------------------------------------------------------------------------

function format(value: number, unit: string): string {
  const text = Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${text}${unit}`;
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) max = min + 1;
  const span = max - min;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= count) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function fillClass(i: number, color: string | null): string {
  return color ? ` style="fill:${color}"` : ` class="mu-f${(i % 8) + 1}"`;
}

function strokeClass(i: number, color: string | null): string {
  return color ? ` style="stroke:${color}"` : ` class="mu-s${(i % 8) + 1}"`;
}

function xySvg(model: ChartModel, titleId: string): string {
  const { labels, series, height, unit } = model;
  const stacked = model.stacked && model.type !== 'line';
  let lo = 0;
  let hi = 0;
  labels.forEach((_, j) => {
    if (stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[j]!;
        if (v >= 0) pos += v;
        else neg += v;
      }
      hi = Math.max(hi, pos);
      lo = Math.min(lo, neg);
    } else {
      for (const s of series) {
        hi = Math.max(hi, s.values[j]!);
        lo = Math.min(lo, s.values[j]!);
      }
    }
  });
  const ticks = niceTicks(lo, hi);
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const tickWidth = Math.max(...ticks.map((t) => format(t, unit).length)) * 7 + 12;
  const left = Math.min(Math.max(tickWidth, 32), 120);
  const top = 12;
  const bottom = 30;
  const right = 12;
  const plotW = WIDTH - left - right;
  const plotH = height - top - bottom;
  const y = (v: number) => top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const band = plotW / labels.length;
  const x = (j: number) => left + band * j + band / 2;

  let out = `<svg class="mu-chart-svg" viewBox="0 0 ${WIDTH} ${height}" width="100%" role="img" aria-labelledby="${titleId}"><title id="${titleId}">${escapeHtml(model.title || `${model.type} chart`)}</title>`;
  // Grid and axis labels
  for (const t of ticks) {
    const ty = y(t).toFixed(1);
    out += `<line class="mu-chart-grid${t === 0 ? ' mu-chart-zero' : ''}" x1="${left}" x2="${WIDTH - right}" y1="${ty}" y2="${ty}"/>`;
    out += `<text class="mu-chart-tick" x="${left - 8}" y="${ty}" text-anchor="end" dominant-baseline="middle">${escapeHtml(format(t, unit))}</text>`;
  }
  const maxChars = Math.max(3, Math.floor(band / 7));
  labels.forEach((label, j) => {
    const text = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
    out += `<text class="mu-chart-label" x="${x(j).toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHtml(text)}</text>`;
  });

  const tip = (j: number, s: Series) => `<title>${escapeHtml(`${labels[j]} — ${s.name}: ${format(s.values[j]!, unit)}`)}</title>`;

  if (model.type === 'bar') {
    const inner = band * 0.72;
    const barW = stacked ? inner : inner / series.length;
    labels.forEach((_, j) => {
      let pos = 0;
      let neg = 0;
      series.forEach((s, i) => {
        const v = s.values[j]!;
        let from: number;
        let to: number;
        if (stacked) {
          from = v >= 0 ? pos : neg;
          to = from + v;
          if (v >= 0) pos = to;
          else neg = to;
        } else {
          from = 0;
          to = v;
        }
        const bx = stacked ? x(j) - inner / 2 : x(j) - inner / 2 + barW * i;
        const y1 = y(Math.max(from, to));
        const h = Math.max(Math.abs(y(from) - y(to)), v === 0 ? 0 : 1);
        out += `<rect${fillClass(i, s.color)} x="${bx.toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(barW - 2, 1).toFixed(1)}" height="${h.toFixed(1)}" rx="2">${tip(j, s)}</rect>`;
      });
    });
  } else {
    const base = y(Math.max(yMin, 0));
    const cumulative = labels.map(() => 0);
    series.forEach((s, i) => {
      const points = s.values.map((v, j) => {
        const value = stacked ? cumulative[j]! + v : v;
        return [x(j), y(value)] as const;
      });
      const lower = stacked ? labels.map((_, j) => [x(j), y(cumulative[j]!)] as const) : null;
      if (stacked) s.values.forEach((v, j) => (cumulative[j] = cumulative[j]! + v));
      const line = points.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
      if (model.type === 'area') {
        const back = lower
          ? [...lower].reverse().map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
          : `L${points[points.length - 1]![0].toFixed(1)} ${base.toFixed(1)} L${points[0]![0].toFixed(1)} ${base.toFixed(1)}`;
        const fill = s.color ? ` class="mu-chart-area" style="fill:${s.color}"` : ` class="mu-chart-area mu-f${(i % 8) + 1}"`;
        out += `<path${fill} d="${line} ${back} Z"/>`;
      }
      out += `<path${strokeClass(i, s.color)} fill="none" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" d="${line}"/>`;
      points.forEach(([px, py], j) => {
        out += `<circle${fillClass(i, s.color)} cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5">${tip(j, s)}</circle>`;
      });
    });
  }
  return `${out}</svg>`;
}

function pieSvg(model: ChartModel, titleId: string): string {
  const size = Math.min(model.height, 320);
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const inner = model.type === 'donut' ? r * 0.58 : 0;
  const values = model.series[0]!.values.map((v) => Math.max(0, v));
  const total = values.reduce((a, b) => a + b, 0);
  let out = `<svg class="mu-chart-svg mu-chart-pie" viewBox="0 0 ${size} ${size}" width="${size}" role="img" aria-labelledby="${titleId}"><title id="${titleId}">${escapeHtml(model.title || `${model.type} chart`)}</title>`;
  if (total <= 0) return `${out}<circle class="mu-chart-grid" cx="${cx}" cy="${cy}" r="${r}" fill="none"/></svg>`;
  let angle = -Math.PI / 2;
  values.forEach((v, i) => {
    if (v === 0) return;
    const share = v / total;
    const tip = `<title>${escapeHtml(`${model.labels[i]}: ${format(v, model.unit)} (${(share * 100).toFixed(1)}%)`)}</title>`;
    if (share >= 0.9999) {
      out += `<circle${fillClass(i, null)} cx="${cx}" cy="${cy}" r="${r}">${tip}</circle>`;
      if (inner) out += `<circle class="mu-chart-hole" cx="${cx}" cy="${cy}" r="${inner}"/>`;
      return;
    }
    const end = angle + share * Math.PI * 2;
    const large = share > 0.5 ? 1 : 0;
    const p = (a: number, rad: number) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const d = inner
      ? `M${p(angle, r)} A${r} ${r} 0 ${large} 1 ${p(end, r)} L${p(end, inner)} A${inner} ${inner} 0 ${large} 0 ${p(angle, inner)} Z`
      : `M${cx} ${cy} L${p(angle, r)} A${r} ${r} 0 ${large} 1 ${p(end, r)} Z`;
    out += `<path${fillClass(i, null)} d="${d}">${tip}</path>`;
    angle = end;
  });
  return `${out}</svg>`;
}

function legend(model: ChartModel): string {
  const pie = model.type === 'pie' || model.type === 'donut';
  const items = pie
    ? model.labels.map((label, i) => ({ label, i, color: null as string | null }))
    : model.series.map((s, i) => ({ label: s.name, i, color: s.color }));
  return `<ul class="mu-chart-legend">${items
    .map(({ label, i, color }) => `<li><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2"${fillClass(i, color)}/></svg>${escapeHtml(label)}</li>`)
    .join('')}</ul>`;
}

function dataTable(model: ChartModel): string {
  const head = `<tr><th scope="col"></th>${model.series.map((s) => `<th scope="col">${escapeHtml(s.name)}</th>`).join('')}</tr>`;
  const rows = model.labels
    .map((label, j) => `<tr><th scope="row">${escapeHtml(label)}</th>${model.series.map((s) => `<td>${escapeHtml(format(s.values[j]!, model.unit))}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="mu-sr-only">${head}${rows}</table>`;
}
