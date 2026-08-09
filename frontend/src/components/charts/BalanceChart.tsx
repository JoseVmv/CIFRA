import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_COLORS, xAxisProps, yAxisProps } from './chartTheme';
import { formatBucket, formatCompactCurrency, formatCurrency } from '../../lib/format';
import type { SeriesPoint } from '../../types/api';

function BalanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SeriesPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)]">
      <p className="text-[13px] text-ink-3">{formatBucket(point.bucket)}</p>
      <p className="tnum mt-0.5 text-sm font-semibold text-ink">
        {formatCurrency(point.balanceCents)}
      </p>
    </div>
  );
}

/**
 * Evolução do saldo acumulado. Série única: o título já diz o que é a linha,
 * então não há legenda — só o valor final rotulado no eixo.
 */
export function BalanceChart({ series, height = 240 }: { series: SeriesPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.balance} stopOpacity={0.16} />
            <stop offset="100%" stopColor={CHART_COLORS.balance} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={formatBucket} {...xAxisProps} />
        <YAxis tickFormatter={formatCompactCurrency} {...yAxisProps} />
        <Tooltip
          content={<BalanceTooltip />}
          cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="balanceCents"
          name="Saldo"
          stroke={CHART_COLORS.balance}
          strokeWidth={2}
          fill="url(#balance-fill)"
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BalanceTable({ series }: { series: SeriesPoint[] }) {
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-ink-3">
            <th className="py-2 font-medium">Data</th>
            <th className="py-2 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {series.map((point) => (
            <tr key={point.bucket} className="border-t border-line">
              <td className="py-2 text-ink-2">{formatBucket(point.bucket)}</td>
              <td className="py-2 text-right text-ink">{formatCurrency(point.balanceCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
