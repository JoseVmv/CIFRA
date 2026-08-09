import { useState } from 'react';
import { PageHeader } from '../components/layout/AppShell';
import { PeriodSelector, usePeriodLabel } from '../components/layout/PeriodSelector';
import { BalanceChart, BalanceTable } from '../components/charts/BalanceChart';
import { CashflowChart, CashflowTable } from '../components/charts/CashflowChart';
import { CategoryBreakdown } from '../components/charts/CategoryBreakdown';
import { ChartCard } from '../components/charts/ChartCard';
import { Card, CardHeader } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useFinance } from '../context/FinanceContext';
import { useApiResource } from '../hooks/useApiResource';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { cn } from '../lib/cn';
import type { TransactionType } from '../types/api';

const BREAKDOWN_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Saídas' },
  { value: 'income', label: 'Entradas' },
];

export function AnalyticsPage() {
  const { period, version } = useFinance();
  const periodLabel = usePeriodLabel();
  const [breakdownType, setBreakdownType] = useState<TransactionType>('expense');

  const statistics = useApiResource(() => api.getStatistics(period), [period, version]);

  if (statistics.error && !statistics.data) {
    return (
      <Card>
        <ErrorState message={statistics.error} onRetry={statistics.reload} />
      </Card>
    );
  }

  const data = statistics.data;
  const series = data?.series ?? [];
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
          <p className="text-[13px] font-medium text-ink-3">Resumo · {periodLabel}</p>
          <dl className="mt-4 grid gap-5 sm:grid-cols-3">
            <SummaryLine
              label="Entradas"
              value={data ? formatCurrency(data.totals.incomeCents) : null}
              tone="income"
            />
            <SummaryLine
              label="Saídas"
              value={data ? formatCurrency(data.totals.expenseCents) : null}
              tone="expense"
            />
            <SummaryLine
              label="Resultado"
              value={data ? formatCurrency(data.totals.netCents) : null}
              tone={data && data.totals.netCents < 0 ? 'expense' : 'income'}
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
                title={breakdownType === 'expense' ? 'Nenhuma saída no período' : 'Nenhuma entrada no período'}
                description="Escolha outro período ou registre transações para ver a distribuição."
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function SummaryLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone: 'income' | 'expense';
}) {
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
    </div>
  );
}
