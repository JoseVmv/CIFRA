import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { Field, Select, TextInput } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { api, ApiError } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { FREQUENCY_OPTIONS, MONTHS, WEEKDAYS } from '../../lib/recurrence';
import type { CashflowType, Recurrence, RecurrenceFrequency } from '../../types/api';

const MAX_DESCRIPTION = 140;

const TYPE_OPTIONS: ReadonlyArray<{ value: CashflowType; label: string }> = [
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' },
];

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

function validate(state: FormState, requiresAccount: boolean): FormErrors {
  const errors: FormErrors = {};

  if (state.amountCents <= 0) errors.amountCents = 'Informe um valor maior que zero.';
  if (!state.description.trim()) errors.description = 'Descreva o lançamento.';
  if (!state.category) errors.category = 'Escolha uma categoria.';
  if (!ISO_DATE.test(state.startDate)) errors.startDate = 'Informe uma data válida.';
  if (state.endDate && !ISO_DATE.test(state.endDate)) errors.endDate = 'Informe uma data válida.';
  else if (state.endDate && state.endDate < state.startDate) {
    errors.endDate = 'A data final precisa vir depois do início.';
  }
  if (requiresAccount && !state.accountId) errors.accountId = 'Escolha a conta desta recorrência.';

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
    const validation = validate(state, requiresAccount);
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
        notify('Recorrência atualizada');
      } else {
        await api.createRecurrence(payload);
        notify('Recorrência criada');
      }
      refresh();
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a recorrência. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar recorrência' : 'Nova recorrência'}
      description="O app cria essa transação sozinho toda vez que a data chegar."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="recurrence-form" variant="primary" loading={submitting}>
            {isEditing ? 'Salvar alterações' : 'Criar recorrência'}
          </Button>
        </>
      }
    >
      <form id="recurrence-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <SegmentedControl
          ariaLabel="Tipo da recorrência"
          size="md"
          className="w-full"
          options={TYPE_OPTIONS}
          value={state.type}
          onChange={(type) => {
            setState((current) => ({ ...current, type, category: '' }));
            setErrors((current) => ({ ...current, category: undefined }));
          }}
        />

        <Field label="Valor" error={errors.amountCents}>
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

        <Field label="Descrição" error={errors.description}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              maxLength={MAX_DESCRIPTION}
              autoComplete="off"
              placeholder={state.type === 'income' ? 'Salário' : 'Aluguel'}
              value={state.description}
              onChange={(event) => update('description', event.target.value)}
            />
          )}
        </Field>

        <Field label="Categoria" error={errors.category}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={state.category}
              onChange={(event) => update('category', event.target.value)}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Com que frequência">
            {({ id }) => (
              <Select
                id={id}
                value={state.frequency}
                onChange={(event) =>
                  update('frequency', event.target.value as RecurrenceFrequency)
                }
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {state.frequency === 'weekly' ? (
            <Field label="Dia da semana">
              {({ id }) => (
                <Select
                  id={id}
                  value={String(state.weekday)}
                  onChange={(event) => update('weekday', Number(event.target.value))}
                >
                  {WEEKDAYS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field
              label="Dia do mês"
              hint={state.dayOfMonth > 28 ? 'Meses mais curtos usam o último dia.' : undefined}
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
          <Field label="Mês">
            {({ id }) => (
              <Select
                id={id}
                value={String(state.month)}
                onChange={(event) => update('month', Number(event.target.value))}
              >
                {MONTHS.map((option) => (
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
            label="Começa em"
            error={errors.startDate}
            hint="Datas já passadas a partir daqui são lançadas de uma vez."
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

          <Field label="Termina em" error={errors.endDate} hint="Deixe em branco para não ter fim.">
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
            <Field label="Conta" error={errors.accountId}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={state.accountId}
                  onChange={(event) => update('accountId', event.target.value)}
                >
                  <option value="" disabled>
                    Selecione…
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
              Você ativou múltiplas contas mas ainda não cadastrou nenhuma. Adicione suas contas em{' '}
              <strong className="font-medium text-ink">Usuário</strong> para vincular os
              lançamentos.
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
