// Geometria dos gráficos: funções puras que recebem os dados e devolvem
// coordenadas prontas para desenhar em SVG. Nenhuma dependência de DOM ou
// React, então são testáveis isoladamente e funcionam também na exportação
// estática de HTML.

export interface Point2D {
  x: number;
  y: number;
}

export interface ChartDatum {
  label: string;
  value: number;
}

export interface BarGeometry {
  label: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarChartLayout {
  bars: BarGeometry[];
  width: number;
  height: number;
  baseline: number;
}

const PADDING = { top: 16, right: 16, bottom: 32, left: 16 };

export function computeBarChart(data: ChartDatum[], width: number, height: number): BarChartLayout {
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = innerW * 0.02;
  const barWidth = data.length > 0 ? (innerW - gap * (data.length - 1)) / data.length : 0;

  const bars: BarGeometry[] = data.map((d, i) => {
    const barHeight = (d.value / max) * innerH;
    return {
      label: d.label,
      value: d.value,
      x: PADDING.left + i * (barWidth + gap),
      y: PADDING.top + (innerH - barHeight),
      width: barWidth,
      height: barHeight,
    };
  });

  return { bars, width, height, baseline: PADDING.top + innerH };
}

export interface LineChartLayout {
  points: Point2D[];
  path: string;
  width: number;
  height: number;
  baseline: number;
}

export function computeLineChart(data: ChartDatum[], width: number, height: number): LineChartLayout {
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points: Point2D[] = data.map((d, i) => ({
    x: PADDING.left + i * step,
    y: PADDING.top + (innerH - (d.value / max) * innerH),
  }));

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

  return { points, path, width, height, baseline: PADDING.top + innerH };
}

export interface PieSlice {
  label: string;
  value: number;
  fraction: number;
  path: string;
}

export interface PieChartLayout {
  slices: PieSlice[];
  cx: number;
  cy: number;
  radius: number;
}

export function computePieChart(data: ChartDatum[], width: number, height: number): PieChartLayout {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 8;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  let angle = -Math.PI / 2;
  const slices: PieSlice[] = data.map((d) => {
    const fraction = d.value / total;
    const start = angle;
    const end = angle + fraction * Math.PI * 2;
    angle = end;
    const largeArc = end - start > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    return { label: d.label, value: d.value, fraction, path };
  });

  return { slices, cx, cy, radius };
}
