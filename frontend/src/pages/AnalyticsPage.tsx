import { useState } from 'react';
import { PageHeader } from '../components/layout/AppShell';
import { PeriodSelector, usePeriodLabel } from '../components/layout/PeriodSelector';
import { BalanceChart, BalanceTable } from '../components/charts/BalanceChart';
import { CashflowChart, CashflowTable } from '../components/charts/CashflowChart';
import { CategoryBreakdown } from '../components/charts/CategoryBreakdown';
import { ChartCard } from '../components/charts/ChartCard';
import { BudgetsCard } from '../components/budgets/BudgetsCard';
import { Card, CardHeader } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { IconArrowDown, IconArrowUp } from '../components/ui/Icons';
import { useFinance } from '../context/FinanceContext';
import { useApiResource } from '../hooks/useApiResource';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { periodWindowLabel } from '../lib/months';
import { cn } from '../lib/cn';
import type { TransactionType } from '../types/api';

const BREAKDOWN_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Saídas' },
  { value: 'income', label: 'Entradas' },
];

export function AnalyticsPage() {
  const { period, anchor, version } = useFinance();
  const periodLabel = usePeriodLabel();
  const [breakdownType, setBreakdownType] = useState<TransactionType>('expense');

  const statistics = useApiResource(
    () => api.getStatistics(period, anchor),
    [period, anchor, version],
  );

  if (statistics.error && !statistics.data) {
    return (
      <Card>
        <ErrorState message={statistics.error} onRetry={statistics.reload} />
      </Card>
    );
  }

  const data = statistics.data;
  const series = data?.series ?? [];
  const comparison = data?.comparison ?? null;
  const slices =
    breakdownType === 'expense' ? (data?.expensesByCategory ?? []) : (data?.incomeByCategory ?? []);
  const granularityNote =
    data?.range.granularity === 'month' ? 'Agrupado por mês' : 'Um ponto por dia';

  return (
    <>
      <PageHeader
        title="Análises"
        description="Como o seu dinheiro se moveu ao longo do tempo."
        actions={<PeriodSelector />}
      />

      <div className="flex flex-col gap-4 sm:gap-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium text-ink-3">Resumo · {periodLabel}</p>
            {comparison && (
              <p className="text-xs text-ink-3">
                comparado com {periodWindowLabel(period, comparison.range.to ?? anchor)}
              </p>
            )}
          </div>

          <dl className="mt-4 grid gap-5 sm:grid-cols-3">
            <SummaryLine
              label="Entradas"
              value={data ? formatCurrency(data.totals.incomeCents) : null}
              tone="income"
              change={comparison?.incomeChangePercent ?? null}
              previous={comparison ? formatCurrency(comparison.totals.incomeCents) : null}
              higherIsBetter
            />
            <SummaryLine
              label="Saídas"
              value={data ? formatCurrency(data.totals.expenseCents) : null}
              tone="expense"
              change={comparison?.expenseChangePercent ?? null}
              previous={comparison ? formatCurrency(comparison.totals.expenseCents) : null}
            />
            <SummaryLine
              label="Resultado"
              value={data ? formatCurrency(data.totals.netCents) : null}
              tone={data && data.totals.netCents < 0 ? 'expense' : 'income'}
              previous={comparison ? formatCurrency(comparison.totals.netCents) : null}
              change={null}
              higherIsBetter
            />
          </dl>
        </Card>

        <ChartCard
          title="Entradas e saídas"
          description={`${periodLabel} · ${granularityNote}`}
          dimmed={statistics.isRefreshing}
          legend={[
            { label: 'Entradas', color: 'var(--income)' },
            { label: 'Saídas', color: 'var(--expense)' },
          ]}
          table={<CashflowTable series={series} />}
        >
          {statistics.isInitialLoading ? (
            <Skeleton className="mx-3 h-[272px]" />
          ) : (
            <CashflowChart series={series} height={300} />
          )}
        </ChartCard>

        <BudgetsCard />

        <ChartCard
          title="Evolução do saldo"
          description={`Saldo acumulado ao final de cada ${data?.range.granularity === 'month' ? 'mês' : 'dia'}`}
          dimmed={statistics.isRefreshing}
          table={<BalanceTable series={series} />}
        >
          {statistics.isInitialLoading ? (
            <Skeleton className="mx-3 h-[240px]" />
          ) : (
            <BalanceChart series={series} />
          )}
        </ChartCard>

        <Card>
          <CardHeader
            title="Distribuição por categoria"
            description={periodLabel}
            action={
              <SegmentedControl
                ariaLabel="Tipo de transação na distribuição"
                options={BREAKDOWN_OPTIONS}
                value={breakdownType}
                onChange={setBreakdownType}
              />
            }
          />
          <div className="px-5 pt-6 pb-6 sm:px-6">
            {statistics.isInitialLoading ? (
              <div className="flex flex-col gap-5">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={index}>
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="mt-2 h-1.5 w-full" />
                  </div>
                ))}
              </div>
            ) : slices.length > 0 ? (
              <CategoryBreakdown slices={slices} type={breakdownType} maxRows={9} />
            ) : (
              <EmptyState
                title={
                  breakdownType === 'expense'
                    ? 'Nenhuma saída no período'
                    : 'Nenhuma entrada no período'
                }
                description="Escolha outro período ou registre transações para ver a distribuição."
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

interface SummaryLineProps {
  label: string;
  value: string | null;
  tone: 'income' | 'expense';
  /** Variação percentual contra o período anterior; `null` esconde o indicador. */
  change: number | null;
  previous: string | null;
  /** Para entradas, subir é bom. Para saídas, subir é ruim. */
  higherIsBetter?: boolean;
}

function SummaryLine({
  label,
  value,
  tone,
  change,
  previous,
  higherIsBetter = false,
}: SummaryLineProps) {
  return (
    <div>
      <dt className="text-[13px] text-ink-3">{label}</dt>
      {value === null ? (
        <Skeleton className="mt-2 h-6 w-28" />
      ) : (
        <dd
          className={cn(
            'mt-1.5 text-[22px] font-semibold tracking-[-0.02em]',
            tone === 'income' ? 'text-income-text' : 'text-expense-text',
          )}
        >
          {value}
        </dd>
      )}
      {previous !== null && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
          {change !== null && <ChangeBadge change={change} higherIsBetter={higherIsBetter} />}
          <span>antes {previous}</span>
        </p>
      )}
    </div>
  );
}

function ChangeBadge({ change, higherIsBetter }: { change: number; higherIsBetter: boolean }) {
  if (change === 0) {
    return <span className="text-ink-3">sem variação</span>;
  }

  const rising = change > 0;
  const good = rising === higherIsBetter;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        good ? 'text-income-text' : 'text-expense-text',
      )}
    >
      {rising ? <IconArrowUp className="size-3" /> : <IconArrowDown className="size-3" />}
      {rising ? '+' : '−'}
      {Math.abs(change).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  );
}
