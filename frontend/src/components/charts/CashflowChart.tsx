import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BAR_RADIUS,
  CHART_COLORS,
  MAX_BAR_SIZE,
  PENDING_BAR,
  xAxisProps,
  yAxisProps,
} from './chartTheme';
import type { LegendItem } from './ChartCard';
import { formatBucket, formatCompactCurrency, formatCurrency } from '../../lib/format';
import type { SeriesPoint } from '../../types/api';

interface TooltipPayloadItem {
  payload: SeriesPoint;
}

function CashflowTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const net = point.incomeCents - point.expenseCents;

  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)]">
      <p className="text-[13px] font-medium text-ink">{formatBucket(point.bucket)}</p>
      <dl className="mt-2 space-y-1.5 text-[13px]">
        <Row color={CHART_COLORS.income} label="Entradas" value={formatCurrency(point.incomeCents)} />
        <Row color={CHART_COLORS.expense} label="Saídas" value={formatCurrency(point.expenseCents)} />
        <div className="flex items-center justify-between gap-6 border-t border-line pt-1.5">
          <dt className="text-ink-3">Resultado</dt>
          <dd className="tnum font-medium text-ink">{formatCurrency(net)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="flex items-center gap-2 text-ink-2">
        <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
        {label}
      </dt>
      <dd className="tnum text-ink">{value}</dd>
    </div>
  );
}

/**
 * Legenda do gráfico. A marca do previsto só entra quando há algo previsto —
 * em "Este mês" e nas janelas sem recorrência ela simplesmente não existe.
 */
export function cashflowLegend(series: SeriesPoint[]): LegendItem[] {
  const legend: LegendItem[] = [
    { label: 'Entradas', color: CHART_COLORS.income },
    { label: 'Saídas', color: CHART_COLORS.expense },
  ];

  const hasPending = series.some(
    (point) => point.pendingIncomeCents > 0 || point.pendingExpenseCents > 0,
  );
  if (hasPending) {
    legend.push({
      label: 'Previsto pelas recorrências',
      color: PENDING_BAR.fill,
      variant: 'ghost',
    });
  }

  return legend;
}

/**
 * Entradas × saídas por dia (ou por mês, em períodos longos).
 *
 * As barras pontilhadas são o que as recorrências ainda vão lançar. Elas ficam
 * empilhadas sobre as barras reais — que valem zero no futuro — para ocupar
 * exatamente o mesmo lugar, sem estreitar nem deslocar nada. São ilustrativas:
 * não aparecem no resumo, na tabela nem no balão de valores.
 */
export function CashflowChart({ series, height = 272 }: { series: SeriesPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={formatBucket} {...xAxisProps} />
        <YAxis tickFormatter={formatCompactCurrency} {...yAxisProps} />
        <Tooltip
          content={<CashflowTooltip />}
          cursor={{ fill: 'var(--surface-inset)', fillOpacity: 0.7 }}
        />
        <Bar
          dataKey="incomeCents"
          name="Entradas"
          stackId="income"
          fill={CHART_COLORS.income}
          radius={BAR_RADIUS}
          maxBarSize={MAX_BAR_SIZE}
        />
        <Bar
          dataKey="pendingIncomeCents"
          name="Entradas previstas"
          stackId="income"
          radius={BAR_RADIUS}
          maxBarSize={MAX_BAR_SIZE}
          {...PENDING_BAR}
        />
        <Bar
          dataKey="expenseCents"
          name="Saídas"
          stackId="expense"
          fill={CHART_COLORS.expense}
          radius={BAR_RADIUS}
          maxBarSize={MAX_BAR_SIZE}
        />
        <Bar
          dataKey="pendingExpenseCents"
          name="Saídas previstas"
          stackId="expense"
          radius={BAR_RADIUS}
          maxBarSize={MAX_BAR_SIZE}
          {...PENDING_BAR}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Equivalente textual do gráfico — mesmos números, sem depender de cor. */
export function CashflowTable({ series }: { series: SeriesPoint[] }) {
  const rows = series.filter((point) => point.incomeCents > 0 || point.expenseCents > 0);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-[13px] text-ink-3">Nenhum movimento no período.</p>;
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-ink-3">
            <th className="py-2 font-medium">Data</th>
            <th className="py-2 text-right font-medium">Entradas</th>
            <th className="py-2 text-right font-medium">Saídas</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map((point) => (
            <tr key={point.bucket} className="border-t border-line">
              <td className="py-2 text-ink-2">{formatBucket(point.bucket)}</td>
              <td className="py-2 text-right text-ink">{formatCurrency(point.incomeCents)}</td>
              <td className="py-2 text-right text-ink">{formatCurrency(point.expenseCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
