import { useState } from 'react';
import { PageHeader } from '../components/layout/AppShell';
import { PeriodSelector, usePeriodLabel } from '../components/layout/PeriodSelector';
import { BalanceChart, BalanceTable } from '../components/charts/BalanceChart';
import { CashflowChart, CashflowTable, cashflowLegend } from '../components/charts/CashflowChart';
import { CategoryBreakdown } from '../components/charts/CategoryBreakdown';
import { ChartCard } from '../components/charts/ChartCard';
import { BudgetsCard } from '../components/budgets/BudgetsCard';
import { Card, CardHeader } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { IconArrowDown, IconArrowUp } from '../components/ui/Icons';
import { useFinance } from '../context/FinanceContext';
import { useApiResource } from '../hooks/useApiResource';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { formatCurrency, formatPercent } from '../lib/format';
import { periodWindowLabel } from '../lib/months';
import { cn } from '../lib/cn';
import type { TransactionType } from '../types/api';

export function AnalyticsPage() {
  const { period, anchor, version } = useFinance();
  const periodLabel = usePeriodLabel();
  const t = useT();
  const [breakdownType, setBreakdownType] = useState<TransactionType>('expense');

  const breakdownOptions: ReadonlyArray<{ value: TransactionType; label: string }> = [
    { value: 'expense', label: t.type.expensePlural },
    { value: 'income', label: t.type.incomePlural },
  ];

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
  const byMonth = data?.range.granularity === 'month';
  const granularityNote = byMonth ? t.analytics.groupedByMonth : t.analytics.onePointPerDay;

  return (
    <>
      <PageHeader
        title={t.analytics.title}
        description={t.analytics.subtitle}
        actions={<PeriodSelector />}
      />

      <div className="flex flex-col gap-4 sm:gap-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium text-ink-3">
              {t.analytics.summary} · {periodLabel}
            </p>
            {comparison && (
              <p className="text-xs text-ink-3">
                {t.analytics.comparedWith(
                  periodWindowLabel(period, comparison.range.to ?? anchor) || t.period.all,
                )}
              </p>
            )}
          </div>

          <dl className="mt-4 grid gap-5 sm:grid-cols-3">
            <SummaryLine
              label={t.type.incomePlural}
              value={data ? formatCurrency(data.totals.incomeCents) : null}
              tone="income"
              change={comparison?.incomeChangePercent ?? null}
              previous={comparison ? formatCurrency(comparison.totals.incomeCents) : null}
              higherIsBetter
            />
            <SummaryLine
              label={t.type.expensePlural}
              value={data ? formatCurrency(data.totals.expenseCents) : null}
              tone="expense"
              change={comparison?.expenseChangePercent ?? null}
              previous={comparison ? formatCurrency(comparison.totals.expenseCents) : null}
            />
            <SummaryLine
              label={t.dashboard.result}
              value={data ? formatCurrency(data.totals.netCents) : null}
              tone={data && data.totals.netCents < 0 ? 'expense' : 'income'}
              previous={comparison ? formatCurrency(comparison.totals.netCents) : null}
              change={null}
              higherIsBetter
            />
          </dl>
        </Card>

        <ChartCard
          title={t.dashboard.cashflowTitle}
          description={`${periodLabel} · ${granularityNote}`}
          dimmed={statistics.isRefreshing}
          legend={cashflowLegend(series, t)}
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
          title={t.analytics.balanceEvolution}
          description={t.analytics.balanceEvolutionHint(byMonth)}
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
            title={t.analytics.distribution}
            description={periodLabel}
            action={
              <SegmentedControl
                ariaLabel={t.analytics.distributionType}
                options={breakdownOptions}
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
                    ? t.analytics.noExpenseTitle
                    : t.analytics.noIncomeTitle
                }
                description={t.analytics.distributionEmpty}
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
  const t = useT();

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
          <span>{t.analytics.before(previous)}</span>
        </p>
      )}
    </div>
  );
}

function ChangeBadge({ change, higherIsBetter }: { change: number; higherIsBetter: boolean }) {
  const t = useT();

  if (change === 0) {
    return <span className="text-ink-3">{t.analytics.noChange}</span>;
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
      {formatPercent(Math.abs(change))}%
    </span>
  );
}
