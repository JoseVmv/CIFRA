import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { Field, Select } from '../ui/Field';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { api, ApiError } from '../../lib/api';
import type { BudgetUsage } from '../../types/api';

/** Janelas oferecidas na interface. A API aceita de 1 a 24 meses. */
const MONTH_OPTIONS = [
  { value: 1, label: 'A cada mês' },
  { value: 2, label: 'A cada 2 meses' },
  { value: 3, label: 'A cada 3 meses' },
  { value: 6, label: 'A cada 6 meses' },
  { value: 12, label: 'A cada 12 meses' },
] as const;

interface BudgetDialogProps {
  open: boolean;
  onClose: () => void;
  /** Quando presente, o diálogo edita em vez de criar. */
  budget: BudgetUsage | null;
  /** Categorias que já têm limite — não podem se repetir. */
  usedCategories: string[];
}

interface FormErrors {
  category?: string;
  limitCents?: string;
}

export function BudgetDialog({ open, onClose, budget, usedCategories }: BudgetDialogProps) {
  const { categories, refresh } = useFinance();
  const { notify } = useToast();

  const [category, setCategory] = useState('');
  const [limitCents, setLimitCents] = useState(0);
  const [months, setMonths] = useState<number>(1);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(budget);

  useEffect(() => {
    if (!open) return;
    setCategory(budget?.category ?? '');
    setLimitCents(budget?.limitCents ?? 0);
    setMonths(budget?.months ?? 1);
    setErrors({});
    setFormError(null);
  }, [open, budget]);

  /** Só categorias de saída fazem sentido, e sem repetir as que já têm limite. */
  const categoryOptions = useMemo(() => {
    const available = (categories?.expense ?? []).filter(
      (option) => option === budget?.category || !usedCategories.includes(option),
    );
    return category && !available.includes(category) ? [category, ...available] : available;
  }, [categories, usedCategories, budget, category]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    const validation: FormErrors = {};
    if (!category) validation.category = 'Escolha a categoria do limite.';
    if (limitCents <= 0) validation.limitCents = 'Informe um limite maior que zero.';
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const payload = { category, limitCents, months };
      if (budget) {
        await api.updateBudget(budget.id, payload);
        notify('Limite atualizado');
      } else {
        await api.createBudget(payload);
        notify('Limite criado');
      }
      refresh();
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Não foi possível salvar o limite.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar limite' : 'Novo limite de gasto'}
      description="Defina quanto você quer gastar numa categoria e em que intervalo."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="budget-form" variant="primary" loading={submitting}>
            {isEditing ? 'Salvar alterações' : 'Criar limite'}
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Categoria" error={errors.category}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setErrors((current) => ({ ...current, category: undefined }));
              }}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Limite" error={errors.limitCents}>
          {({ id, describedBy, invalid }) => (
            <CurrencyInput
              id={id}
              size="lg"
              aria-describedby={describedBy}
              invalid={invalid}
              valueCents={limitCents}
              onChangeCents={(cents) => {
                setLimitCents(cents);
                setErrors((current) => ({ ...current, limitCents: undefined }));
              }}
            />
          )}
        </Field>

        <Field
          label="Período do limite"
          hint="O consumo é somado nessa janela, terminando no mês que você está vendo."
        >
          {({ id }) => (
            <Select
              id={id}
              value={String(months)}
              onChange={(event) => setMonths(Number(event.target.value))}
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

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
