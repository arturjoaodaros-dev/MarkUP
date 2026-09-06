import type { Chart as ChartNode } from '@markup/core';
import { computeBarChart, computeLineChart, computePieChart } from '../charts/geometry';

const WIDTH = 480;
const HEIGHT = 240;
const PALETTE = ['var(--mu-chart-1)', 'var(--mu-chart-2)', 'var(--mu-chart-3)', 'var(--mu-chart-4)', 'var(--mu-chart-5)'];

export function Chart({ node }: { node: ChartNode }) {
  return (
    <figure className="mu-chart" data-chart-type={node.chartType}>
      {node.title && <figcaption className="mu-chart-title">{node.title}</figcaption>}
      {node.series.length === 0 ? (
        <p className="mu-empty">Nenhum dado para exibir.</p>
      ) : node.chartType === 'line' ? (
        <LineChart data={node.series} />
      ) : node.chartType === 'pie' ? (
        <PieChart data={node.series} />
      ) : (
        <BarChart data={node.series} />
      )}
    </figure>
  );
}

function BarChart({ data }: { data: ChartNode['series'] }) {
  const layout = computeBarChart(data, WIDTH, HEIGHT);
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Gráfico de barras" className="mu-chart-svg">
      <line x1={0} y1={layout.baseline} x2={WIDTH} y2={layout.baseline} className="mu-chart-axis" />
      {layout.bars.map((bar, i) => (
        <g key={bar.label}>
          <rect x={bar.x} y={bar.y} width={bar.width} height={Math.max(bar.height, 1)} fill={PALETTE[i % PALETTE.length]} rx={3} />
          <text x={bar.x + bar.width / 2} y={layout.baseline + 16} textAnchor="middle" className="mu-chart-label">
            {bar.label}
          </text>
          <text x={bar.x + bar.width / 2} y={bar.y - 6} textAnchor="middle" className="mu-chart-value">
            {bar.value}
          </text>
        </g>
      ))}
    </svg>
  );
}

function LineChart({ data }: { data: ChartNode['series'] }) {
  const layout = computeLineChart(data, WIDTH, HEIGHT);
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Gráfico de linha" className="mu-chart-svg">
      <line x1={0} y1={layout.baseline} x2={WIDTH} y2={layout.baseline} className="mu-chart-axis" />
      <path d={layout.path} fill="none" stroke="var(--mu-chart-1)" strokeWidth={2} />
      {layout.points.map((p, i) => (
        <g key={data[i].label}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="var(--mu-chart-1)" />
          <text x={p.x} y={layout.baseline + 16} textAnchor="middle" className="mu-chart-label">
            {data[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PieChart({ data }: { data: ChartNode['series'] }) {
  const layout = computePieChart(data, HEIGHT, HEIGHT);
  return (
    <div className="mu-pie-wrap">
      <svg viewBox={`0 0 ${HEIGHT} ${HEIGHT}`} role="img" aria-label="Gráfico de pizza" className="mu-chart-svg">
        {layout.slices.map((slice, i) => (
          <path key={slice.label} d={slice.path} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </svg>
      <ul className="mu-pie-legend">
        {layout.slices.map((slice, i) => (
          <li key={slice.label}>
            <span className="mu-legend-swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
            {slice.label} · {(slice.fraction * 100).toFixed(0)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
