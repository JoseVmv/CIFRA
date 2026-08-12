import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Select, TextInput } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { periodOptions, useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useApiResource } from '../../hooks/useApiResource';
import { useLanguage, useT } from '../../i18n';
import { categoryLabel, compareByLabel } from '../../i18n/categories';
import type { Dictionary } from '../../i18n/pt';
import { api, ApiError } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { periodWindow, periodWindowLabel, startOfMonth } from '../../lib/months';
import {
  buildExport,
  downloadFile,
  fileNameOf,
  formatOptions,
  mimeTypeOf,
  printDocument,
  type ExportFilters,
  type ExportFormat,
} from '../../lib/export';
import type { PeriodKey, TransactionQuery, TransactionType } from '../../types/api';

type PeriodChoice = PeriodKey | 'custom';
type TypeChoice = TransactionType | '';
type Order = 'desc' | 'asc';

interface FormState {
  period: PeriodChoice;
  from: string;
  to: string;
  type: TypeChoice;
  category: string;
  accountId: string;
  format: ExportFormat;
  order: Order;
  includeTotals: boolean;
}

export interface ExportDefaults {
  type: TypeChoice;
  category: string;
  accountId: string;
  period: PeriodKey;
  search: string;
}

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** O que a tela já está filtrando — o diálogo abre em cima disso. */
  defaults: ExportDefaults;
}

export function ExportDialog({ open, onClose, defaults }: ExportDialogProps) {
  const { anchor, categories, settings, accounts, version } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const { language, locale, currency } = useLanguage();

  const typeOptions: ReadonlyArray<{ value: TypeChoice; label: string }> = [
    { value: '', label: t.exportDialog.everything },
    { value: 'income', label: t.type.incomePlural },
    { value: 'expense', label: t.type.expensePlural },
    { value: 'transfer', label: t.type.transferPlural },
  ];

  const useAccounts = (settings?.useMultipleAccounts ?? false) && (accounts?.length ?? 0) > 0;

  const [state, setState] = useState<FormState>(() => initialState(defaults, anchor));
  const [search, setSearch] = useState(defaults.search);
  const [debouncedSearch, setDebouncedSearch] = useState(defaults.search);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setState(initialState(defaults, anchor));
    setSearch(defaults.search);
    setDebouncedSearch(defaults.search);
    setError(null);
  }, [open, defaults, anchor]);

  // A prévia só vai à API depois que o usuário para de digitar.
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const query = useMemo<TransactionQuery>(
    () => buildQuery(state, debouncedSearch, anchor),
    [state, debouncedSearch, anchor],
  );

  const range = useMemo(() => resolveRange(state, anchor), [state, anchor]);

  // Só a contagem: a exportação em si busca tudo, na hora do clique.
  const preview = useApiResource(
    () => (open ? api.listTransactions({ ...query, limit: 1 }) : Promise.resolve(null)),
    [open, query, version],
  );

  const total = preview.data?.total ?? 0;
  const isCsv = state.format === 'csv-excel' || state.format === 'csv-padrao';
  const formats = formatOptions(t);
  const formatHint = formats.find((option) => option.value === state.format)?.hint;

  const categoryOptions = useMemo(() => {
    if (!categories) return [];
    // Transferência tem categoria própria e fixa: não há o que escolher.
    if (state.type === 'transfer') return [];
    if (state.type) return categories[state.type];
    return [...new Set([...categories.income, ...categories.expense])].sort((a, b) =>
      compareByLabel(a, b, language, locale),
    );
  }, [categories, state.type, language, locale]);

  const filters = useMemo<ExportFilters>(
    () => ({
      periodLabel:
        state.period === 'custom'
          ? `${range.from ?? ''} – ${range.to ?? todayIso()}`
          : periodLabelOf(state.period, anchor, t),
      from: range.from,
      to: range.to,
      type: state.type,
      category: state.category,
      accountName: accounts?.find((account) => account.id === state.accountId)?.name ?? '',
      search: debouncedSearch,
    }),
    [state, range, anchor, accounts, debouncedSearch, t],
  );

  const fileName = fileNameOf(state.format, filters, todayIso());

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setState((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function handleExport(): Promise<void> {
    setExporting(true);
    setError(null);
    try {
      const items = await api.listAllTransactions(query);
      if (items.length === 0) {
        setError(t.exportDialog.emptyError);
        return;
      }

      // A API devolve da mais recente para a mais antiga.
      const transactions = state.order === 'asc' ? [...items].reverse() : items;
      const content = buildExport(state.format, {
        transactions,
        filters,
        includeTotals: isCsv && state.includeTotals,
        t,
        language,
        currency,
      });

      if (state.format === 'pdf') {
        printDocument(content);
        notify(t.exportDialog.printReady);
      } else {
        downloadFile(content, fileName, mimeTypeOf(state.format));
        notify(t.exportDialog.exported(items.length));
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.exportDialog.failed);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.exportDialog.title}
      description={t.exportDialog.description}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={exporting}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={exporting}
            disabled={total === 0}
            onClick={() => void handleExport()}
          >
            {state.format === 'pdf' ? t.exportDialog.openPrint : t.exportDialog.download}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={t.exportDialog.format} hint={formatHint}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={state.format}
              onChange={(event) => update('format', event.target.value as ExportFormat)}
            >
              {formats.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t.exportDialog.period}>
          {({ id }) => (
            <Select
              id={id}
              value={state.period}
              onChange={(event) => update('period', event.target.value as PeriodChoice)}
            >
              {periodOptions(t).map((option) => (
                <option key={option.key} value={option.key}>
                  {periodLabelOf(option.key, anchor, t)}
                </option>
              ))}
              <option value="custom">{t.exportDialog.customDates}</option>
            </Select>
          )}
        </Field>

        {state.period === 'custom' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t.exportDialog.from}>
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  max={state.to || '2100-12-31'}
                  value={state.from}
                  onChange={(event) => update('from', event.target.value)}
                />
              )}
            </Field>
            <Field label={t.exportDialog.to}>
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  min={state.from || '1900-01-01'}
                  value={state.to}
                  onChange={(event) => update('to', event.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">{t.exportDialog.whatToExport}</span>
          <SegmentedControl
            ariaLabel={t.exportDialog.whatToExport}
            size="md"
            className="w-full"
            options={typeOptions}
            value={state.type}
            onChange={(type) => setState((current) => ({ ...current, type, category: '' }))}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.transactionDialog.category}>
            {({ id }) => (
              <Select
                id={id}
                value={state.category}
                onChange={(event) => update('category', event.target.value)}
              >
                <option value="">{t.common.all}</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category, language)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t.exportDialog.order}>
            {({ id }) => (
              <Select
                id={id}
                value={state.order}
                onChange={(event) => update('order', event.target.value as Order)}
              >
                <option value="desc">{t.exportDialog.newestFirst}</option>
                <option value="asc">{t.exportDialog.oldestFirst}</option>
              </Select>
            )}
          </Field>
        </div>

        {useAccounts && (
          <Field label={t.transactionDialog.account}>
            {({ id }) => (
              <Select
                id={id}
                value={state.accountId}
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
          </Field>
        )}

        <Field label={t.exportDialog.searchLabel} hint={t.exportDialog.searchHint}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="search"
              maxLength={120}
              autoComplete="off"
              placeholder={t.exportDialog.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        </Field>

        {isCsv && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={state.includeTotals}
              onChange={(event) => update('includeTotals', event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {t.exportDialog.includeTotals}
          </label>
        )}

        <div className="rounded-xl bg-surface-inset px-4 py-3 text-[13px] text-ink-2">
          {preview.isInitialLoading ? (
            t.exportDialog.counting
          ) : total === 0 ? (
            t.exportDialog.emptySelection
          ) : (
            <>
              <strong className="font-medium text-ink">{total}</strong>{' '}
              {t.exportDialog.willExport(total)}
              {state.format !== 'pdf' && (
                <>
                  {' '}
                  {t.exportDialog.inFile} <span className="break-all">{fileName}</span>
                </>
              )}
              .
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-expense-soft px-4 py-3 text-[13px] text-expense-text"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function initialState(defaults: ExportDefaults, anchor: string): FormState {
  return {
    period: defaults.period,
    from: startOfMonth(anchor),
    to: anchor,
    type: defaults.type,
    category: defaults.category,
    accountId: defaults.accountId,
    format: 'csv-excel',
    order: 'desc',
    includeTotals: false,
  };
}

function periodLabelOf(period: PeriodKey, anchor: string, t: Dictionary): string {
  return period === 'all' ? t.period.all : periodWindowLabel(period, anchor);
}

/** O intervalo que a escolha de período representa, para o nome e o cabeçalho. */
function resolveRange(state: FormState, anchor: string): { from: string | null; to: string | null } {
  if (state.period === 'custom') {
    return { from: state.from || null, to: state.to || null };
  }
  return periodWindow(state.period, anchor) ?? { from: null, to: null };
}

function buildQuery(state: FormState, search: string, anchor: string): TransactionQuery {
  const range = resolveRange(state, anchor);

  return {
    search: search || undefined,
    type: state.type || undefined,
    category: state.category || undefined,
    accountId: state.accountId || undefined,
    from: range.from ?? undefined,
    to: range.to ?? undefined,
  };
}
