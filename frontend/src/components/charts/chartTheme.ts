/**
 * Aparência compartilhada dos gráficos.
 *
 * Tudo aponta para os tokens CSS, então claro/escuro trocam sem nenhum
 * JavaScript: o SVG resolve `var(--income)` no momento da pintura.
 */
export const CHART_COLORS = {
  income: 'var(--income)',
  expense: 'var(--expense)',
  balance: 'var(--accent)',
  grid: 'var(--grid)',
  axis: 'var(--axis)',
  label: 'var(--ink-3)',
} as const;

export const axisTick = { fill: CHART_COLORS.label, fontSize: 11 } as const;

export const xAxisProps = {
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.axis },
  tick: axisTick,
  tickMargin: 8,
  minTickGap: 18,
  interval: 'preserveStartEnd',
} as const;

export const yAxisProps = {
  tickLine: false,
  axisLine: false,
  tick: axisTick,
  width: 62,
  tickMargin: 4,
} as const;

/** Marcas finas: barras estreitas e cantos de 4px na ponta dos dados. */
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const MAX_BAR_SIZE = 12;
