import { describe, expect, it } from 'vitest';
import { computeBarChart, computeLineChart, computePieChart } from './geometry';

describe('geometria de gráficos', () => {
  it('barra mais alta corresponde ao maior valor', () => {
    const { bars } = computeBarChart(
      [
        { label: 'Q1', value: 120 },
        { label: 'Q2', value: 240 },
      ],
      200,
      100,
    );
    expect(bars[1].height).toBeGreaterThan(bars[0].height);
  });

  it('linha gera um ponto por dado', () => {
    const { points } = computeLineChart(
      [
        { label: 'Q1', value: 10 },
        { label: 'Q2', value: 20 },
        { label: 'Q3', value: 5 },
      ],
      200,
      100,
    );
    expect(points).toHaveLength(3);
  });

  it('pizza distribui frações que somam 1', () => {
    const { slices } = computePieChart(
      [
        { label: 'A', value: 1 },
        { label: 'B', value: 3 },
      ],
      100,
      100,
    );
    const total = slices.reduce((sum, s) => sum + s.fraction, 0);
    expect(total).toBeCloseTo(1);
  });
});
