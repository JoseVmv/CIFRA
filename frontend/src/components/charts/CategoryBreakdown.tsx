import { useMemo } from 'react';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { CategorySlice, TransactionType } from '../../types/api';

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

interface CategoryBreakdownProps {
  slices: CategorySlice[];
  type: TransactionType;
  /** Categorias além disso viram uma linha "outras" — a lista continua legível. */
  maxRows?: number;
  className?: string;
}

/**
 * Ranking de "para onde o dinheiro foi".
 *
 * Barras horizontais em vez de pizza: comparam valores próximos com precisão e
 * comportam nomes longos. Uma única cor para todas as barras — o comprimento já
 * codifica a magnitude, então pintar cada categoria de um tom diferente
 * gastaria o canal de cor sem acrescentar informação.
 */
export function CategoryBreakdown({
  slices,
  type,
  maxRows = 8,
  className,
}: CategoryBreakdownProps) {
  const rows = useMemo(() => {
    if (slices.length <= maxRows) return slices;

    const visible = slices.slice(0, maxRows - 1);
    const rest = slices.slice(maxRows - 1);
    const merged: CategorySlice = {
      category: `Outras ${rest.length} categorias`,
      totalCents: rest.reduce((sum, slice) => sum + slice.totalCents, 0),
      percent: Math.round(rest.reduce((sum, slice) => sum + slice.percent, 0) * 10) / 10,
      count: rest.reduce((sum, slice) => sum + slice.count, 0),
    };
    return [...visible, merged];
  }, [slices, maxRows]);

  const largest = rows[0]?.totalCents ?? 0;
  const color = type === 'income' ? 'var(--income)' : 'var(--expense)';

  return (
    <ul className={cn('flex flex-col gap-4', className)}>
      {rows.map((slice) => (
        <li key={slice.category}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate text-[13px] font-medium text-ink">{slice.category}</span>
            <span className="tnum shrink-0 text-[13px] text-ink-2">
              {formatCurrency(slice.totalCents)}
              <span className="ml-2 text-ink-3">{percentFormatter.format(slice.percent)}%</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-inset">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${largest > 0 ? Math.max((slice.totalCents / largest) * 100, 1.5) : 0}%`,
                // Degradê horizontal muito curto: a barra "acende" até a ponta.
                backgroundImage: `linear-gradient(90deg, color-mix(in oklab, ${color} 70%, transparent), ${color})`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
