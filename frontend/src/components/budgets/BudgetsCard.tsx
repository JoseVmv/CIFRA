import { useState } from 'react';
import { BudgetDialog } from './BudgetDialog';
import { Card, CardHeader } from '../ui/Card';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/States';
import { IconPencil, IconPlus, IconTarget, IconTrash } from '../ui/Icons';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useApiResource } from '../../hooks/useApiResource';
import { useLanguage, useT } from '../../i18n';
import { categoryLabel } from '../../i18n/categories';
import type { Dictionary } from '../../i18n/pt';
import { api, ApiError } from '../../lib/api';
import { formatCurrency, formatDayMonth, formatPercent } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { BudgetStatus, BudgetUsage } from '../../types/api';

/** Cada estado tem cor e rótulo — a cor nunca conta a história sozinha. */
const STATUS_STYLE: Record<BudgetStatus, { bar: string; text: string }> = {
  ok: { bar: 'var(--accent)', text: 'text-ink-3' },
  warning: { bar: 'var(--warning)', text: 'text-warning-text' },
  exceeded: { bar: 'var(--expense)', text: 'text-expense-text' },
};

function statusLabel(status: BudgetStatus, t: Dictionary): string | null {
  if (status === 'warning') return t.budgets.nearLimit;
  if (status === 'exceeded') return t.budgets.exceeded;
  return null;
}

export function BudgetsCard() {
  const { anchor, version, refresh } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const { language } = useLanguage();

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
      notify(t.budgets.removed(categoryLabel(budget.category, language)));
      refresh();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : t.budgets.removeFailed, 'error');
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title={t.budgets.title}
          description={t.budgets.subtitle}
          action={
            items.length > 0 && (
              <Button size="sm" variant="secondary" icon={<IconPlus />} onClick={openNew}>
                {t.budgets.newBudget}
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
              title={t.budgets.emptyTitle}
              description={t.budgets.emptyDescription}
              action={
                <Button variant="primary" icon={<IconPlus />} onClick={openNew}>
                  {t.budgets.createBudget}
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
  const t = useT();
  const { language } = useLanguage();
  const style = STATUS_STYLE[budget.status];
  const label = statusLabel(budget.status, t);
  const name = categoryLabel(budget.category, language);

  return (
    <li className="group">
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-sm font-medium text-ink">{name}</span>
        <span className="tnum shrink-0 text-[13px] text-ink-2">
          {formatCurrency(budget.spentCents)}
          <span className="text-ink-3">
            {' '}
            {t.common.of} {formatCurrency(budget.limitCents)}
          </span>
        </span>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-inset"
        role="progressbar"
        aria-valuenow={Math.round(budget.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.budgets.usageLabel(name)}
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
          <span className="tnum font-medium">{formatPercent(budget.percent, 0)}%</span>
          {label && <> · {label}</>}
          <span className="text-ink-3">
            {' · '}
            {budget.remainingCents >= 0
              ? t.budgets.remaining(formatCurrency(budget.remainingCents))
              : t.budgets.over(formatCurrency(-budget.remainingCents))}
          </span>
        </p>

        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <span className="mr-1 hidden text-[11px] text-ink-3 sm:inline">
            {formatDayMonth(budget.window.from)} – {formatDayMonth(budget.window.to)}
          </span>
          <IconButton label={t.budgets.editLabel(name)} className="size-7" onClick={onEdit}>
            <IconPencil />
          </IconButton>
          <IconButton
            label={t.budgets.removeLabel(name)}
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
