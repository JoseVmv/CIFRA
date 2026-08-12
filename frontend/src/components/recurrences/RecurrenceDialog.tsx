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
import { todayIso } from '../../lib/format';
import { frequencyOptions, monthOptions, weekdayOptions } from '../../lib/recurrence';
import type { CashflowType, Recurrence, RecurrenceFrequency } from '../../types/api';

const MAX_DESCRIPTION = 140;

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, index) => index + 1);

interface FormState {
  type: CashflowType;
  amountCents: number;
  description: string;
  category: string;
  accountId: string;
  frequency: RecurrenceFrequency;
  dayOfMonth: number;
  weekday: number;
  month: number;
  startDate: string;
  endDate: string;
}

type FormErrors = Partial<
  Record<'amountCents' | 'description' | 'category' | 'startDate' | 'endDate' | 'accountId', string>
>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function initialState(recurrence: Recurrence | null): FormState {
  const start = todayIso();

  if (recurrence) {
    return {
      type: recurrence.type,
      amountCents: recurrence.amountCents,
      description: recurrence.description,
      category: recurrence.category,
      accountId: recurrence.accountId ?? '',
      frequency: recurrence.frequency,
      dayOfMonth: recurrence.dayOfMonth,
      weekday: recurrence.weekday,
      month: recurrence.month,
      startDate: recurrence.startDate,
      endDate: recurrence.endDate ?? '',
    };
  }

  return {
    type: 'income',
    amountCents: 0,
    description: '',
    category: '',
    accountId: '',
    frequency: 'monthly',
    dayOfMonth: Number(start.slice(8, 10)),
    weekday: new Date().getDay(),
    month: Number(start.slice(5, 7)),
    startDate: start,
    endDate: '',
  };
}

function validate(state: FormState, requiresAccount: boolean, t: Dictionary): FormErrors {
  const errors: FormErrors = {};

  if (state.amountCents <= 0) errors.amountCents = t.transactionDialog.errorAmount;
  if (!state.description.trim()) errors.description = t.recurrences.errorDescription;
  if (!state.category) errors.category = t.transactionDialog.errorCategory;
  if (!ISO_DATE.test(state.startDate)) errors.startDate = t.transactionDialog.errorDate;
  if (state.endDate && !ISO_DATE.test(state.endDate))
    errors.endDate = t.transactionDialog.errorDate;
  else if (state.endDate && state.endDate < state.startDate) {
    errors.endDate = t.recurrences.errorEndBeforeStart;
  }
  if (requiresAccount && !state.accountId) errors.accountId = t.recurrences.errorAccount;

  return errors;
}

interface RecurrenceDialogProps {
  open: boolean;
  onClose: () => void;
  /** Quando presente, o diálogo edita em vez de criar. */
  recurrence: Recurrence | null;
}

export function RecurrenceDialog({ open, onClose, recurrence }: RecurrenceDialogProps) {
  const { categories, refresh, settings, accounts } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const { language } = useLanguage();

  const typeOptions: ReadonlyArray<{ value: CashflowType; label: string }> = [
    { value: 'income', label: t.type.income },
    { value: 'expense', label: t.type.expense },
  ];

  const useAccounts = settings?.useMultipleAccounts ?? false;
  const accountOptions = accounts ?? [];
  const requiresAccount = useAccounts && accountOptions.length > 0;

  const [state, setState] = useState<FormState>(() => initialState(recurrence));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(recurrence);

  useEffect(() => {
    if (!open) return;
    setState(initialState(recurrence));
    setErrors({});
    setFormError(null);
  }, [open, recurrence]);

  const categoryOptions = useMemo(() => {
    const list = categories?.[state.type] ?? [];
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
      category: state.category,
      accountId: useAccounts ? state.accountId || null : null,
      frequency: state.frequency,
      dayOfMonth: state.dayOfMonth,
      weekday: state.weekday,
      month: state.month,
      startDate: state.startDate,
      endDate: state.endDate || null,
      active: recurrence?.active ?? true,
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (recurrence) {
        await api.updateRecurrence(recurrence.id, payload);
        notify(t.recurrences.updated);
      } else {
        await api.createRecurrence(payload);
        notify(t.recurrences.created);
      }
      refresh();
      onClose();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t.recurrences.saveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t.recurrences.editDialogTitle : t.recurrences.newDialogTitle}
      description={t.recurrences.dialogDescription}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="recurrence-form" variant="primary" loading={submitting}>
            {isEditing ? t.common.saveChanges : t.recurrences.createRecurrence}
          </Button>
        </>
      }
    >
      <form id="recurrence-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <SegmentedControl
          ariaLabel={t.recurrences.typeLabel}
          size="md"
          className="w-full"
          options={typeOptions}
          value={state.type}
          onChange={(type) => {
            setState((current) => ({ ...current, type, category: '' }));
            setErrors((current) => ({ ...current, category: undefined }));
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
                  ? t.recurrences.incomePlaceholder
                  : t.recurrences.expensePlaceholder
              }
              value={state.description}
              onChange={(event) => update('description', event.target.value)}
            />
          )}
        </Field>

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

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.recurrences.frequency}>
            {({ id }) => (
              <Select
                id={id}
                value={state.frequency}
                onChange={(event) =>
                  update('frequency', event.target.value as RecurrenceFrequency)
                }
              >
                {frequencyOptions(t).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {state.frequency === 'weekly' ? (
            <Field label={t.recurrences.weekday}>
              {({ id }) => (
                <Select
                  id={id}
                  value={String(state.weekday)}
                  onChange={(event) => update('weekday', Number(event.target.value))}
                >
                  {weekdayOptions(t).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field
              label={t.recurrences.dayOfMonth}
              hint={state.dayOfMonth > 28 ? t.recurrences.dayOfMonthHint : undefined}
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={String(state.dayOfMonth)}
                  onChange={(event) => update('dayOfMonth', Number(event.target.value))}
                >
                  {DAYS_OF_MONTH.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>

        {state.frequency === 'yearly' && (
          <Field label={t.recurrences.month}>
            {({ id }) => (
              <Select
                id={id}
                value={String(state.month)}
                onChange={(event) => update('month', Number(event.target.value))}
              >
                {monthOptions(t).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t.recurrences.startsOn}
            error={errors.startDate}
            hint={t.recurrences.startsOnHint}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="date"
                max="2100-12-31"
                min="1900-01-01"
                value={state.startDate}
                onChange={(event) => update('startDate', event.target.value)}
              />
            )}
          </Field>

          <Field
            label={t.recurrences.endsOn}
            error={errors.endDate}
            hint={t.recurrences.endsOnHint}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="date"
                max="2100-12-31"
                min={state.startDate}
                value={state.endDate}
                onChange={(event) => update('endDate', event.target.value)}
              />
            )}
          </Field>
        </div>

        {useAccounts &&
          (accountOptions.length > 0 ? (
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
              {t.recurrences.noAccountsNote}
            </p>
          ))}

        {formError && (
          <p
            role="alert"
            className="rounded-xl bg-expense-soft px-4 py-3 text-[13px] text-expense-text"
          >
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
