import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { Field, Select, TextInput } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { api, ApiError } from '../../lib/api';
import { formatCurrency, todayIso } from '../../lib/format';
import { TRANSFER_CATEGORY, type Transaction, type TransactionType } from '../../types/api';

const MAX_DESCRIPTION = 140;
const MAX_INSTALLMENTS = 48;

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' },
  { value: 'transfer', label: 'Transferência' },
];

const AMOUNT_IS_OPTIONS = [
  { value: 'total' as const, label: 'Valor total' },
  { value: 'installment' as const, label: 'Valor da parcela' },
];

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

function validate(state: FormState, requiresAccount: boolean): FormErrors {
  const errors: FormErrors = {};
  const isTransfer = state.type === 'transfer';

  if (state.amountCents <= 0) errors.amountCents = 'Informe um valor maior que zero.';
  if (!state.description.trim()) errors.description = 'Descreva a transação.';
  else if (state.description.trim().length > MAX_DESCRIPTION)
    errors.description = `Use no máximo ${MAX_DESCRIPTION} caracteres.`;
  if (!isTransfer && !state.category) errors.category = 'Escolha uma categoria.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date) || Number.isNaN(Date.parse(state.date)))
    errors.date = 'Informe uma data válida.';

  if (isTransfer) {
    // Numa transferência a conta deixa de ser opcional: ela é o próprio sentido.
    if (!state.accountId) errors.accountId = 'Escolha a conta de origem.';
    if (!state.transferAccountId) errors.transferAccountId = 'Escolha a conta de destino.';
    else if (state.transferAccountId === state.accountId)
      errors.transferAccountId = 'O destino precisa ser diferente da origem.';
  } else if (requiresAccount && !state.accountId) {
    errors.accountId = 'Escolha a conta desta transação.';
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
    const validation = validate(state, requiresAccount);
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
        notify('Transação atualizada');
      } else if (isSplit) {
        const { items } = await api.createInstallments({
          ...payload,
          installments: state.installments,
          amountIs: state.amountIs,
        });
        notify(`Compra em ${items.length}x adicionada`);
      } else {
        await api.createTransaction(payload);
        notify(
          payload.type === 'income'
            ? 'Entrada adicionada'
            : payload.type === 'transfer'
              ? 'Transferência registrada'
              : 'Saída adicionada',
        );
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
        isEditing
          ? 'As alterações recalculam o saldo na hora.'
          : 'Registre uma entrada, uma saída ou uma transferência entre suas contas.'
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
          options={canTransfer ? TYPE_OPTIONS : TYPE_OPTIONS.slice(0, 2)}
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
          {!isTransfer && (
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
          )}

          <Field label={isSplit ? 'Primeira parcela' : 'Data'} error={errors.date}>
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
            <Field label="De" error={errors.accountId}>
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

            <Field label="Para" error={errors.transferAccountId}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={state.transferAccountId}
                  onChange={(event) => update('transferAccountId', event.target.value)}
                >
                  <option value="" disabled>
                    Selecione…
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
          ))
        )}

        {isTransfer && (
          <p className="rounded-xl bg-surface-inset px-4 py-3 text-[13px] text-ink-2">
            Transferência só move dinheiro entre contas suas: ela não entra em entradas, saídas nem
            nos limites de gasto — só muda o saldo de cada conta.
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
              Compra parcelada
            </label>

            {isSplit && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Parcelas">
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

                  <Field label="O valor acima é o">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={state.amountIs}
                        onChange={(event) =>
                          update('amountIs', event.target.value as FormState['amountIs'])
                        }
                      >
                        {AMOUNT_IS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <p className="text-[13px] text-ink-2">
                  {state.amountCents > 0 ? (
                    <>
                      {state.installments}x de{' '}
                      <strong className="tnum font-medium text-ink">
                        {formatCurrency(preview.rest)}
                      </strong>
                      {preview.first !== preview.rest && (
                        <> (a primeira sai {formatCurrency(preview.first)})</>
                      )}
                      , total de{' '}
                      <strong className="tnum font-medium text-ink">
                        {formatCurrency(preview.total)}
                      </strong>
                      . Uma parcela por mês, a partir da data escolhida.
                    </>
                  ) : (
                    'Informe o valor para ver como as parcelas ficam.'
                  )}
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
