import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/AppShell';
import { PeriodSelector, usePeriodLabel } from '../components/layout/PeriodSelector';
import { SummaryCards } from '../components/dashboard/SummaryCards';
import { CashflowChart, CashflowTable, cashflowLegend } from '../components/charts/CashflowChart';
import { CategoryBreakdown } from '../components/charts/CategoryBreakdown';
import { ChartCard } from '../components/charts/ChartCard';
import { BudgetAlert } from '../components/budgets/BudgetAlert';
import { TransactionList } from '../components/transactions/TransactionList';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { IconEmpty, IconPlus } from '../components/ui/Icons';
import { useFinance } from '../context/FinanceContext';
import { useTransactionDialog } from '../context/TransactionDialogContext';
import { useApiResource } from '../hooks/useApiResource';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/format';

const RECENT_LIMIT = 6;

export function DashboardPage() {
  const { period, anchor, version, settings } = useFinance();
  const { openNew } = useTransactionDialog();
  const periodLabel = usePeriodLabel();
  const t = useT();

  const greeting = settings?.displayName
    ? t.dashboard.greeting(settings.displayName)
    : t.dashboard.subtitle;

  const summary = useApiResource(
    () => api.getSummary(period, anchor),
    [period, anchor, version],
  );
  const statistics = useApiResource(
    () => api.getStatistics(period, anchor),
    [period, anchor, version],
  );
  const recent = useApiResource(
    () => api.listTransactions({ limit: RECENT_LIMIT }),
    [version],
  );

  const isEmptyApp = recent.data?.total === 0;

  if (summary.error && !summary.data) {
    return (
      <Card>
        <ErrorState message={summary.error} onRetry={summary.reload} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={t.dashboard.title} description={greeting} actions={<PeriodSelector />} />

      <div className="flex flex-col gap-4 sm:gap-6">
        <BudgetAlert />

        <SummaryCards
          summary={summary.data}
          periodLabel={periodLabel}
          loading={summary.isInitialLoading}
        />

        {isEmptyApp ? (
          <Card>
            <EmptyState
              icon={<IconEmpty />}
              title={t.dashboard.emptyTitle}
              description={t.dashboard.emptyDescription}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" icon={<IconPlus />} onClick={() => openNew('income')}>
                    {t.nav.newTransaction}
                  </Button>
                  <Link to="/usuario">
                    <Button variant="secondary">{t.dashboard.setInitialBalance}</Button>
                  </Link>
                </div>
              }
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
              <ChartCard
                className="lg:col-span-2"
                title={t.dashboard.cashflowTitle}
                description={periodLabel}
                dimmed={statistics.isRefreshing}
                legend={cashflowLegend(statistics.data?.series ?? [], t)}
                table={<CashflowTable series={statistics.data?.series ?? []} />}
              >
                {statistics.isInitialLoading ? (
                  <Skeleton className="mx-3 h-[272px]" />
                ) : (
                  <CashflowChart series={statistics.data?.series ?? []} />
                )}
              </ChartCard>

              <Card className="flex flex-col">
                <CardHeader title={t.dashboard.whereMoneyWent} description={periodLabel} />
                <div className="flex-1 px-5 pt-5 pb-6 sm:px-6">
                  {statistics.isInitialLoading ? (
                    <div className="flex flex-col gap-5">
                      {[0, 1, 2, 3].map((index) => (
                        <div key={index}>
                          <Skeleton className="h-3.5 w-2/3" />
                          <Skeleton className="mt-2 h-1.5 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : statistics.data && statistics.data.expensesByCategory.length > 0 ? (
                    <CategoryBreakdown
                      slices={statistics.data.expensesByCategory}
                      type="expense"
                      maxRows={6}
                    />
                  ) : (
                    <EmptyState
                      title={t.dashboard.noExpensesTitle}
                      description={t.dashboard.noExpensesDescription}
                      className="py-8"
                    />
                  )}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader
                title={t.dashboard.latest}
                description={
                  recent.data
                    ? t.dashboard.totalCount(recent.data.total)
                    : t.dashboard.loadingHistory
                }
                action={
                  <Link
                    to="/transacoes"
                    className="text-[13px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                  >
                    {t.dashboard.seeHistory}
                  </Link>
                }
              />
              <div className="mt-5">
                {recent.isInitialLoading ? (
                  <div className="flex flex-col gap-4 px-5 pb-6 sm:px-6">
                    {[0, 1, 2].map((index) => (
                      <Skeleton key={index} className="h-12" />
                    ))}
                  </div>
                ) : (
                  <TransactionList transactions={recent.data?.items ?? []} compact />
                )}
              </div>
            </Card>
          </>
        )}

        {summary.data && (
          <p className="px-1 text-xs text-ink-3">
            {t.dashboard.balanceFormula(
              formatCurrency(summary.data.initialBalanceCents),
              settings?.useMultipleAccounts ?? false,
            )}
          </p>
        )}
      </div>
    </>
  );
}
