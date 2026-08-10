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
import type { Transaction, TransactionType } from '../../types/api';

const MAX_DESCRIPTION = 140;

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' },
];

interface FormState {
  type: TransactionType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  accountId: string;
}

type FormErrors = Partial<
  Record<'amountCents' | 'description' | 'category' | 'date' | 'accountId', string>
>;

function initialState(transaction: Transaction | null, type: TransactionType): FormState {
  if (transaction) {
    return {
      type: transaction.type,
      amountCents: transaction.amountCents,
      description: transaction.description,
      category: transaction.category,
      date: transaction.date,
      accountId: transaction.accountId ?? '',
    };
  }
  return { type, amountCents: 0, description: '', category: '', date: todayIso(), accountId: '' };
}

function validate(state: FormState, requiresAccount: boolean): FormErrors {
  const errors: FormErrors = {};

  if (state.amountCents <= 0) errors.amountCents = 'Informe um valor maior que zero.';
  if (!state.description.trim()) errors.description = 'Descreva a transação.';
  else if (state.description.trim().length > MAX_DESCRIPTION)
    errors.description = `Use no máximo ${MAX_DESCRIPTION} caracteres.`;
  if (!state.category) errors.category = 'Escolha uma categoria.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date) || Number.isNaN(Date.parse(state.date)))
    errors.date = 'Informe uma data válida.';
  if (requiresAccount && !state.accountId) errors.accountId = 'Escolha a conta desta transação.';

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
  const { categories, refresh, settings, accounts } = useFinance();
  const { notify } = useToast();

  // Com múltiplas contas ligadas, todo lançamento precisa dizer de onde saiu.
  const useAccounts = settings?.useMultipleAccounts ?? false;
  const accountOptions = accounts ?? [];
  const hasAccounts = accountOptions.length > 0;
  const requiresAccount = useAccounts && hasAccounts;

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
      date: state.date,
      accountId: useAccounts ? state.accountId || null : null,
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

        {useAccounts &&
          (hasAccounts ? (
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
              Você ativou múltiplas contas mas ainda não cadastrou nenhuma. Adicione suas contas
              em <strong className="font-medium text-ink">Usuário</strong> para vincular as
              transações.
            </p>
          ))}

        {formError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 text-[13px] text-expense-text">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
