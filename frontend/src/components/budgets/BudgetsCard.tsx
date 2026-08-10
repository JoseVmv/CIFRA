import { useState } from 'react';
import { BudgetDialog } from './BudgetDialog';
import { Card, CardHeader } from '../ui/Card';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/States';
import { IconPencil, IconPlus, IconTarget, IconTrash } from '../ui/Icons';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useApiResource } from '../../hooks/useApiResource';
import { api, ApiError } from '../../lib/api';
import { formatCurrency, formatDayMonth } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { BudgetStatus, BudgetUsage } from '../../types/api';

const percentFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Cada estado tem cor, rótulo e ícone — a cor nunca conta a história sozinha. */
const STATUS_STYLE: Record<BudgetStatus, { bar: string; text: string; label: string | null }> = {
  ok: { bar: 'var(--accent)', text: 'text-ink-3', label: null },
  warning: { bar: 'var(--warning)', text: 'text-warning-text', label: 'Perto do limite' },
  exceeded: { bar: 'var(--expense)', text: 'text-expense-text', label: 'Limite estourado' },
};

export function BudgetsCard() {
  const { anchor, version, refresh } = useFinance();
  const { notify } = useToast();

  const budgets = useApiResource(() => api.listBudgets(anchor), [anchor, version]);
  const [editing, setEditing] = useState<BudgetUsage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const items = budgets.data?.items ?? [];

  function openNew(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(budget: BudgetUsage): void {
    setEditing(budget);
    setDialogOpen(true);
  }

  async function remove(budget: BudgetUsage): Promise<void> {
    try {
      await api.deleteBudget(budget.id);
      notify(`Limite de ${budget.category} removido`);
      refresh();
    } catch (error) {
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível remover o limite.',
        'error',
      );
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Limites de gastos"
          description="Quanto você quer gastar por categoria, e quanto já foi."
          action={
            items.length > 0 && (
              <Button size="sm" variant="secondary" icon={<IconPlus />} onClick={openNew}>
                Novo limite
              </Button>
            )
          }
        />

        <div className="px-5 pt-5 pb-6 sm:px-6">
          {budgets.isInitialLoading ? (
            <div className="flex flex-col gap-5">
              {[0, 1].map((index) => (
                <div key={index}>
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="mt-2 h-2 w-full" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<IconTarget />}
              title="Nenhum limite definido"
              description="Escolha uma categoria e um valor máximo para o período. O app avisa quando você chegar perto."
              action={
                <Button variant="primary" icon={<IconPlus />} onClick={openNew}>
                  Criar limite
                </Button>
              }
              className="py-8"
            />
          ) : (
            <ul className="flex flex-col gap-6">
              {items.map((budget) => (
                <BudgetRow
                  key={budget.id}
                  budget={budget}
                  onEdit={() => openEdit(budget)}
                  onRemove={() => void remove(budget)}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <BudgetDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        budget={editing}
        usedCategories={items.map((item) => item.category)}
      />
    </>
  );
}

interface BudgetRowProps {
  budget: BudgetUsage;
  onEdit: () => void;
  onRemove: () => void;
}

function BudgetRow({ budget, onEdit, onRemove }: BudgetRowProps) {
  const style = STATUS_STYLE[budget.status];

  return (
    <li className="group">
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-sm font-medium text-ink">{budget.category}</span>
        <span className="tnum shrink-0 text-[13px] text-ink-2">
          {formatCurrency(budget.spentCents)}
          <span className="text-ink-3"> de {formatCurrency(budget.limitCents)}</span>
        </span>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-inset"
        role="progressbar"
        aria-valuenow={Math.round(budget.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Consumo do limite de ${budget.category}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${Math.min(budget.percent, 100)}%`,
            backgroundImage: `linear-gradient(90deg, color-mix(in oklab, ${style.bar} 70%, transparent), ${style.bar})`,
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className={cn('text-xs', style.text)}>
          <span className="tnum font-medium">{percentFormatter.format(budget.percent)}%</span>
          {style.label && <> · {style.label}</>}
          <span className="text-ink-3">
            {' · '}
            {budget.remainingCents >= 0
              ? `restam ${formatCurrency(budget.remainingCents)}`
              : `${formatCurrency(-budget.remainingCents)} acima`}
          </span>
        </p>

        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <span className="mr-1 hidden text-[11px] text-ink-3 sm:inline">
            {formatDayMonth(budget.window.from)} – {formatDayMonth(budget.window.to)}
          </span>
          <IconButton label={`Editar limite de ${budget.category}`} className="size-7" onClick={onEdit}>
            <IconPencil />
          </IconButton>
          <IconButton
            label={`Remover limite de ${budget.category}`}
            className="size-7 hover:bg-expense-soft hover:text-expense-text"
            onClick={onRemove}
          >
            <IconTrash />
          </IconButton>
        </div>
      </div>
    </li>
  );
}
