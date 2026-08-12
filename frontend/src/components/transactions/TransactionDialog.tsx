import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { Field, Select, TextInput } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useLanguage, useT } from '../../i18n';
import { categoryLabel } from '../../i18n/categories';
import type { Dictionary } from '../../i18n/pt';
import { api, ApiError } from '../../lib/api';
import { formatCurrency, todayIso } from '../../lib/format';
import { TRANSFER_CATEGORY, type Transaction, type TransactionType } from '../../types/api';

const MAX_DESCRIPTION = 140;
const MAX_INSTALLMENTS = 48;

interface FormState {
  type: TransactionType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  accountId: string;
  /** Conta de destino — só nas transferências. */
  transferAccountId: string;
  /** Parcelamento — só nas saídas novas. */
  installments: number;
  amountIs: 'total' | 'installment';
}

type FormErrors = Partial<
  Record<
    'amountCents' | 'description' | 'category' | 'date' | 'accountId' | 'transferAccountId',
    string
  >
>;

function initialState(transaction: Transaction | null, type: TransactionType): FormState {
  const base = {
    installments: 1,
    amountIs: 'total' as const,
  };

  if (transaction) {
    return {
      ...base,
      type: transaction.type,
      amountCents: transaction.amountCents,
      description: transaction.description,
      category: transaction.category,
      date: transaction.date,
      accountId: transaction.accountId ?? '',
      transferAccountId: transaction.transferAccountId ?? '',
    };
  }

  return {
    ...base,
    type,
    amountCents: 0,
    description: '',
    category: '',
    date: todayIso(),
    accountId: '',
    transferAccountId: '',
  };
}

function validate(state: FormState, requiresAccount: boolean, t: Dictionary): FormErrors {
  const errors: FormErrors = {};
  const isTransfer = state.type === 'transfer';
  const d = t.transactionDialog;

  if (state.amountCents <= 0) errors.amountCents = d.errorAmount;
  if (!state.description.trim()) errors.description = d.errorDescription;
  else if (state.description.trim().length > MAX_DESCRIPTION)
    errors.description = d.errorDescriptionLong(MAX_DESCRIPTION);
  if (!isTransfer && !state.category) errors.category = d.errorCategory;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date) || Number.isNaN(Date.parse(state.date)))
    errors.date = d.errorDate;

  if (isTransfer) {
    // Numa transferência a conta deixa de ser opcional: ela é o próprio sentido.
    if (!state.accountId) errors.accountId = d.errorFrom;
    if (!state.transferAccountId) errors.transferAccountId = d.errorTo;
    else if (state.transferAccountId === state.accountId)
      errors.transferAccountId = d.errorSameAccount;
  } else if (requiresAccount && !state.accountId) {
    errors.accountId = d.errorAccount;
  }

  return errors;
}

/** Centavos de cada parcela, com a sobra na primeira — espelha o backend. */
function installmentPreview(state: FormState): { first: number; rest: number; total: number } {
  if (state.amountIs === 'installment') {
    return {
      first: state.amountCents,
      rest: state.amountCents,
      total: state.amountCents * state.installments,
    };
  }
  const base = Math.floor(state.amountCents / state.installments);
  return {
    first: base + (state.amountCents - base * state.installments),
    rest: base,
    total: state.amountCents,
  };
}

interface TransactionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Quando presente, o diálogo edita em vez de criar. */
  transaction: Transaction | null;
  defaultType: TransactionType;
}

export function TransactionDialog({
  open,
  onClose,
  transaction,
  defaultType,
}: TransactionDialogProps) {
  const { categories, refresh, settings, accounts } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const { language } = useLanguage();

  const typeOptions: ReadonlyArray<{ value: TransactionType; label: string }> = [
    { value: 'income', label: t.type.income },
    { value: 'expense', label: t.type.expense },
    { value: 'transfer', label: t.type.transfer },
  ];

  const amountIsOptions = [
    { value: 'total' as const, label: t.transactionDialog.amountIsTotal },
    { value: 'installment' as const, label: t.transactionDialog.amountIsInstallment },
  ];

  // Com múltiplas contas ligadas, todo lançamento precisa dizer de onde saiu.
  const useAccounts = settings?.useMultipleAccounts ?? false;
  const accountOptions = accounts ?? [];
  const hasAccounts = accountOptions.length > 0;
  const requiresAccount = useAccounts && hasAccounts;
  /**
   * Transferir exige o modo de múltiplas contas e pelo menos duas contas: sem
   * isso o efeito da transferência — mudar o saldo de cada conta — não teria
   * onde aparecer.
   */
  const canTransfer = useAccounts && accountOptions.length >= 2;

  const [state, setState] = useState<FormState>(() => initialState(transaction, defaultType));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(transaction);

  // Reinicia o formulário sempre que o diálogo é (re)aberto.
  useEffect(() => {
    if (!open) return;
    setState(initialState(transaction, defaultType));
    setErrors({});
    setFormError(null);
  }, [open, transaction, defaultType]);

  const isTransfer = state.type === 'transfer';
  // Parcelar só faz sentido em saída nova: editar uma parcela mexe só nela.
  const canSplit = state.type === 'expense' && !transaction;
  const isSplit = canSplit && state.installments > 1;
  const preview = installmentPreview(state);

  const categoryOptions = useMemo(() => {
    const list = state.type === 'transfer' ? [] : (categories?.[state.type] ?? []);
    // Garante que a categoria de uma transação antiga apareça mesmo se sumiu da lista.
    return state.category && !list.includes(state.category) ? [state.category, ...list] : list;
  }, [categories, state.type, state.category]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setState((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const validation = validate(state, requiresAccount, t);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const payload = {
      type: state.type,
      amountCents: state.amountCents,
      description: state.description.trim(),
      category: isTransfer ? TRANSFER_CATEGORY : state.category,
      date: state.date,
      accountId: useAccounts || isTransfer ? state.accountId || null : null,
      transferAccountId: isTransfer ? state.transferAccountId : null,
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (transaction) {
        await api.updateTransaction(transaction.id, payload);
        notify(t.transactionDialog.updated);
      } else if (isSplit) {
        const { items } = await api.createInstallments({
          ...payload,
          installments: state.installments,
          amountIs: state.amountIs,
        });
        notify(t.transactionDialog.createdInstallments(items.length));
      } else {
        await api.createTransaction(payload);
        notify(
          payload.type === 'income'
            ? t.transactionDialog.createdIncome
            : payload.type === 'transfer'
              ? t.transactionDialog.createdTransfer
              : t.transactionDialog.createdExpense,
        );
      }
      refresh();
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : t.transactionDialog.saveFailed,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t.transactionDialog.editTitle : t.transactionDialog.newTitle}
      description={
        isEditing ? t.transactionDialog.editDescription : t.transactionDialog.newDescription
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="transaction-form" variant="primary" loading={submitting}>
            {isEditing ? t.common.saveChanges : t.common.add}
          </Button>
        </>
      }
    >
      <form id="transaction-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <SegmentedControl
          ariaLabel={t.transactionDialog.typeLabel}
          size="md"
          className="w-full"
          options={canTransfer ? typeOptions : typeOptions.slice(0, 2)}
          value={state.type}
          onChange={(type) => {
            setState((current) => ({
              ...current,
              type,
              category: '',
              // Trocar de tipo zera o que só valia no anterior.
              transferAccountId: type === 'transfer' ? current.transferAccountId : '',
              installments: type === 'expense' ? current.installments : 1,
            }));
            setErrors({});
          }}
        />

        <Field label={t.transactionDialog.amount} error={errors.amountCents}>
          {({ id, describedBy, invalid }) => (
            <CurrencyInput
              id={id}
              size="lg"
              aria-describedby={describedBy}
              invalid={invalid}
              valueCents={state.amountCents}
              onChangeCents={(cents) => update('amountCents', cents)}
            />
          )}
        </Field>

        <Field label={t.transactionDialog.description} error={errors.description}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              maxLength={MAX_DESCRIPTION}
              autoComplete="off"
              placeholder={
                state.type === 'income'
                  ? t.transactionDialog.incomePlaceholder
                  : t.transactionDialog.expensePlaceholder
              }
              value={state.description}
              onChange={(event) => update('description', event.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          {!isTransfer && (
            <Field label={t.transactionDialog.category} error={errors.category}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={state.category}
                  onChange={(event) => update('category', event.target.value)}
                >
                  <option value="" disabled>
                    {t.common.select}
                  </option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabel(category, language)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <Field
            label={isSplit ? t.transactionDialog.firstInstallment : t.transactionDialog.date}
            error={errors.date}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="date"
                max="2100-12-31"
                min="1900-01-01"
                value={state.date}
                onChange={(event) => update('date', event.target.value)}
              />
            )}
          </Field>
        </div>

        {isTransfer ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t.transactionDialog.from} error={errors.accountId}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={state.accountId}
                  onChange={(event) => update('accountId', event.target.value)}
                >
                  <option value="" disabled>
                    {t.common.select}
                  </option>
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label={t.transactionDialog.to} error={errors.transferAccountId}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={state.transferAccountId}
                  onChange={(event) => update('transferAccountId', event.target.value)}
                >
                  <option value="" disabled>
                    {t.common.select}
                  </option>
                  {accountOptions
                    .filter((account) => account.id !== state.accountId)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
        ) : (
          useAccounts &&
          (hasAccounts ? (
            <Field label={t.transactionDialog.account} error={errors.accountId}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={state.accountId}
                  onChange={(event) => update('accountId', event.target.value)}
                >
                  <option value="" disabled>
                    {t.common.select}
                  </option>
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <p className="rounded-xl bg-surface-inset px-4 py-3 text-[13px] text-ink-2">
              {t.transactionDialog.noAccountsNote}
            </p>
          ))
        )}

        {isTransfer && (
          <p className="rounded-xl bg-surface-inset px-4 py-3 text-[13px] text-ink-2">
            {t.transactionDialog.transferNote}
          </p>
        )}

        {canSplit && (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={isSplit}
                onChange={(event) => update('installments', event.target.checked ? 2 : 1)}
                className="size-4 accent-[var(--accent)]"
              />
              {t.transactionDialog.installment}
            </label>

            {isSplit && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.transactionDialog.installmentCount}>
                    {({ id }) => (
                      <Select
                        id={id}
                        value={String(state.installments)}
                        onChange={(event) => update('installments', Number(event.target.value))}
                      >
                        {Array.from({ length: MAX_INSTALLMENTS - 1 }, (_, index) => index + 2).map(
                          (count) => (
                            <option key={count} value={count}>
                              {count}x
                            </option>
                          ),
                        )}
                      </Select>
                    )}
                  </Field>

                  <Field label={t.transactionDialog.amountIs}>
                    {({ id }) => (
                      <Select
                        id={id}
                        value={state.amountIs}
                        onChange={(event) =>
                          update('amountIs', event.target.value as FormState['amountIs'])
                        }
                      >
                        {amountIsOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <p className="text-[13px] text-ink-2">
                  {state.amountCents > 0
                    ? t.transactionDialog.installmentPreview(
                        state.installments,
                        formatCurrency(preview.rest),
                        formatCurrency(preview.total),
                        preview.first !== preview.rest
                          ? t.transactionDialog.installmentFirstNote(formatCurrency(preview.first))
                          : '',
                      )
                    : t.transactionDialog.installmentPrompt}
                </p>
              </>
            )}
          </div>
        )}

        {formError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 text-[13px] text-expense-text">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
