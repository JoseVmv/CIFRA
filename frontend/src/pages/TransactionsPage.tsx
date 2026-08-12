import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/AppShell';
import { RecurrencesCard } from '../components/recurrences/RecurrencesCard';
import { ExportDialog } from '../components/transactions/ExportDialog';
import { TransactionList } from '../components/transactions/TransactionList';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { IconDownload, IconEmpty, IconPlus, IconSearch } from '../components/ui/Icons';
import { periodOptions, useFinance } from '../context/FinanceContext';
import { useTransactionDialog } from '../context/TransactionDialogContext';
import { useApiResource } from '../hooks/useApiResource';
import { useLanguage, useT } from '../i18n';
import { categoryLabel, compareByLabel } from '../i18n/categories';
import { api } from '../lib/api';
import type { PeriodKey, TransactionType } from '../types/api';

const PAGE_SIZE = 25;
const MAX_ITEMS = 500;

interface Filters {
  search: string;
  type: TransactionType | '';
  category: string;
  accountId: string;
  period: PeriodKey;
}

const INITIAL_FILTERS: Filters = {
  search: '',
  type: '',
  category: '',
  accountId: '',
  period: 'all',
};

export function TransactionsPage() {
  const { version, anchor, categories, settings, accounts } = useFinance();
  const { openNew } = useTransactionDialog();
  const t = useT();
  const { language, locale } = useLanguage();

  // O filtro por conta só aparece quando o usuário usa múltiplas contas.
  const showAccountFilter = (settings?.useMultipleAccounts ?? false) && (accounts?.length ?? 0) > 0;

  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [exportOpen, setExportOpen] = useState(false);

  // O diálogo de exportação abre em cima do que a tela já está mostrando.
  const exportDefaults = useMemo(
    () => ({
      type: filters.type,
      category: filters.category,
      accountId: filters.accountId,
      period: filters.period,
      search: filters.search,
    }),
    [filters],
  );

  // A busca só vai para a API depois que o usuário para de digitar.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput ? current : { ...current, search: searchInput },
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  // Qualquer mudança de filtro volta para a primeira página.
  useEffect(() => setLimit(PAGE_SIZE), [filters]);

  const resource = useApiResource(
    () =>
      api.listTransactions({
        search: filters.search || undefined,
        type: filters.type || undefined,
        category: filters.category || undefined,
        accountId: filters.accountId || undefined,
        period: filters.period === 'all' ? undefined : filters.period,
        reference: filters.period === 'all' ? undefined : anchor,
        limit,
        offset: 0,
      }),
    [filters, limit, anchor, version],
  );

  const categoryOptions = useMemo(() => {
    if (!categories) return [];
    // Transferência tem categoria própria e fixa: não entra na lista.
    if (filters.type === 'income' || filters.type === 'expense') return categories[filters.type];
    const all = new Set([...categories.income, ...categories.expense]);
    return [...all].sort((a, b) => compareByLabel(a, b, language, locale));
  }, [categories, filters.type, language, locale]);

  const hasFilters =
    filters.search !== '' ||
    filters.type !== '' ||
    filters.category !== '' ||
    filters.accountId !== '' ||
    filters.period !== 'all';

  function update<K extends keyof Filters>(key: K, value: Filters[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters(): void {
    setFilters(INITIAL_FILTERS);
    setSearchInput('');
  }

  const items = resource.data?.items ?? [];
  const total = resource.data?.total ?? 0;
  const canLoadMore = items.length < total && limit < MAX_ITEMS;

  return (
    <>
      <PageHeader
        title={t.transactions.title}
        description={t.transactions.subtitle}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconDownload />}
              onClick={() => setExportOpen(true)}
            >
              {t.transactions.export}
            </Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => openNew()}>
              {t.nav.newTransaction}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 sm:gap-5">
        <RecurrencesCard />

        <Card className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t.transactions.searchPlaceholder}
                aria-label={t.transactions.searchLabel}
                maxLength={120}
                className="h-11 w-full rounded-xl border border-line bg-surface pr-3.5 pl-10 text-sm text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none"
              />
            </div>

            <Select
              aria-label={t.transactions.filterType}
              value={filters.type}
              onChange={(event) => update('type', event.target.value as TransactionType | '')}
            >
              <option value="">{t.transactions.allTypes}</option>
              <option value="income">{t.transactions.onlyIncome}</option>
              <option value="expense">{t.transactions.onlyExpense}</option>
              <option value="transfer">{t.transactions.onlyTransfer}</option>
            </Select>

            <Select
              aria-label={t.transactions.filterCategory}
              value={filters.category}
              onChange={(event) => update('category', event.target.value)}
            >
              <option value="">{t.transactions.allCategories}</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category, language)}
                </option>
              ))}
            </Select>

            <Select
              aria-label={t.transactions.filterPeriod}
              value={filters.period}
              onChange={(event) => update('period', event.target.value as PeriodKey)}
            >
              {periodOptions(t).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>

            {showAccountFilter && (
              <Select
                aria-label={t.transactions.filterAccount}
                value={filters.accountId}
                onChange={(event) => update('accountId', event.target.value)}
              >
                <option value="">{t.transactions.allAccounts}</option>
                {(accounts ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {hasFilters && (
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-line pt-3">
              <p className="text-[13px] text-ink-3">
                {total === 0 ? t.transactions.noResults : t.transactions.resultCount(total)}
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-[13px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
              >
                {t.transactions.clearFilters}
              </button>
            </div>
          )}
        </Card>

        <Card className={resource.isRefreshing ? 'opacity-60 transition-opacity' : undefined}>
          {resource.error && !resource.data ? (
            <ErrorState message={resource.error} onRetry={resource.reload} />
          ) : resource.isInitialLoading ? (
            <div className="flex flex-col gap-3 p-5 sm:p-6">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-14" />
              ))}
            </div>
          ) : items.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={<IconSearch />}
                title={t.transactions.notFoundTitle}
                description={t.transactions.notFoundDescription}
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    {t.transactions.clearFilters}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<IconEmpty />}
                title={t.transactions.emptyTitle}
                description={t.transactions.emptyDescription}
                action={
                  <Button variant="primary" icon={<IconPlus />} onClick={() => openNew()}>
                    {t.nav.newTransaction}
                  </Button>
                }
              />
            )
          ) : (
            <>
              <TransactionList transactions={items} />
              {(canLoadMore || items.length > PAGE_SIZE) && (
                <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                  <p className="text-[13px] text-ink-3">
                    {t.transactions.showing(items.length, total)}
                  </p>
                  {canLoadMore && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={resource.isRefreshing}
                      onClick={() => setLimit((current) => Math.min(current + PAGE_SIZE, MAX_ITEMS))}
                    >
                      {t.common.loadMore}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaults={exportDefaults}
      />
    </>
  );
}
