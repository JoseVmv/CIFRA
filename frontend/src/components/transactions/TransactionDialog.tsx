import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Select, TextInput } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { api, ApiError } from '../../lib/api';
import { centsToDigits, digitsToCents, formatDecimal, todayIso } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Transaction, TransactionType } from '../../types/api';

const MAX_DESCRIPTION = 140;

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' },
];

interface FormState {
  type: TransactionType;
  amountDigits: string;
  description: string;
  category: string;
  date: string;
}

type FormErrors = Partial<Record<'amountDigits' | 'description' | 'category' | 'date', string>>;

function initialState(transaction: Transaction | null, type: TransactionType): FormState {
  if (transaction) {
    return {
      type: transaction.type,
      amountDigits: centsToDigits(transaction.amountCents),
      description: transaction.description,
      category: transaction.category,
      date: transaction.date,
    };
  }
  return { type, amountDigits: '', description: '', category: '', date: todayIso() };
}

function validate(state: FormState): FormErrors {
  const errors: FormErrors = {};
  const cents = digitsToCents(state.amountDigits);

  if (cents <= 0) errors.amountDigits = 'Informe um valor maior que zero.';
  if (!state.description.trim()) errors.description = 'Descreva a transação.';
  else if (state.description.trim().length > MAX_DESCRIPTION)
    errors.description = `Use no máximo ${MAX_DESCRIPTION} caracteres.`;
  if (!state.category) errors.category = 'Escolha uma categoria.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date) || Number.isNaN(Date.parse(state.date)))
    errors.date = 'Informe uma data válida.';

  return errors;
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
  const { categories, refresh } = useFinance();
  const { notify } = useToast();

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

  const categoryOptions = useMemo(() => {
    const list = categories?.[state.type] ?? [];
    // Garante que a categoria de uma transação antiga apareça mesmo se sumiu da lista.
    return state.category && !list.includes(state.category) ? [state.category, ...list] : list;
  }, [categories, state.type, state.category]);

  const amountCents = digitsToCents(state.amountDigits);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setState((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const validation = validate(state);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const payload = {
      type: state.type,
      amountCents,
      description: state.description.trim(),
      category: state.category,
      date: state.date,
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (transaction) {
        await api.updateTransaction(transaction.id, payload);
        notify('Transação atualizada');
      } else {
        await api.createTransaction(payload);
        notify(payload.type === 'income' ? 'Entrada adicionada' : 'Saída adicionada');
      }
      refresh();
      onClose();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a transação. Tente novamente.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar transação' : 'Nova transação'}
      description={
        isEditing ? 'As alterações recalculam o saldo na hora.' : 'Registre uma entrada ou uma saída.'
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="transaction-form" variant="primary" loading={submitting}>
            {isEditing ? 'Salvar alterações' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <form id="transaction-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <SegmentedControl
          ariaLabel="Tipo da transação"
          size="md"
          className="w-full"
          options={TYPE_OPTIONS}
          value={state.type}
          onChange={(type) => {
            setState((current) => ({ ...current, type, category: '' }));
            setErrors((current) => ({ ...current, category: undefined }));
          }}
        />

        <Field label="Valor" error={errors.amountDigits}>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <span
                className={cn(
                  'pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-medium',
                  amountCents > 0 ? 'text-ink-2' : 'text-ink-3',
                )}
              >
                R$
              </span>
              <input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0,00"
                value={amountCents > 0 ? formatDecimal(amountCents) : ''}
                onChange={(event) => update('amountDigits', event.target.value.replace(/\D/g, ''))}
                className={cn(
                  'tnum h-14 w-full rounded-xl border border-line bg-surface pr-4 pl-12 text-right',
                  'text-2xl font-semibold tracking-[-0.02em] text-ink placeholder:text-ink-3',
                  'transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none',
                  invalid && 'border-expense/60',
                )}
              />
            </div>
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
              placeholder={state.type === 'income' ? 'Salário de agosto' : 'Almoço no centro'}
              value={state.description}
              onChange={(event) => update('description', event.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
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

          <Field label="Data" error={errors.date}>
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

        {formError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 text-[13px] text-expense-text">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
