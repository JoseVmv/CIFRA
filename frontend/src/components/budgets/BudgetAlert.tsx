import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconAlert, IconClose } from '../ui/Icons';
import { IconButton } from '../ui/Button';
import { useFinance } from '../../context/FinanceContext';
import { useApiResource } from '../../hooks/useApiResource';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import type { BudgetUsage } from '../../types/api';

const STORAGE_KEY = 'cifra.dismissedBudgetAlerts';

/**
 * A dispensa vale para aquele limite naquela janela: fechar o aviso de agosto
 * não esconde o mesmo estouro em setembro.
 */
function alertKey(budget: BudgetUsage): string {
  return `${budget.id}:${budget.window.from}`;
}

function readDismissed(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Balão vermelho no painel quando algum limite passa de 90% do valor definido. */
export function BudgetAlert() {
  const { anchor, version } = useFinance();
  const budgets = useApiResource(() => api.listBudgets(anchor), [anchor, version]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const alerts = useMemo(
    () =>
      (budgets.data?.items ?? []).filter(
        (budget) => budget.status !== 'ok' && !dismissed.includes(alertKey(budget)),
      ),
    [budgets.data, dismissed],
  );

  const dismiss = useCallback((budget: BudgetUsage) => {
    setDismissed((current) => {
      const next = [...current, alertKey(budget)].slice(-50);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignorado */
      }
      return next;
    });
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((budget) => (
        <div
          key={budget.id}
          role="alert"
          className="flex animate-pop-in items-start gap-3 rounded-2xl border border-expense/35 bg-expense-soft px-4 py-3.5"
        >
          <span aria-hidden className="mt-0.5 shrink-0 text-expense-text">
            <IconAlert />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-expense-text">
              {budget.status === 'exceeded'
                ? `Você passou do limite de ${budget.category}`
                : `Você já usou ${Math.round(budget.percent)}% do limite de ${budget.category}`}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {formatCurrency(budget.spentCents)} de {formatCurrency(budget.limitCents)}
              {budget.remainingCents >= 0
                ? ` · restam ${formatCurrency(budget.remainingCents)}`
                : ` · ${formatCurrency(-budget.remainingCents)} acima do planejado`}
              {'. '}
              <Link
                to="/analises"
                className="font-medium text-expense-text underline-offset-4 hover:underline"
              >
                Ver limites
              </Link>
            </p>
          </div>

          <IconButton
            label={`Fechar aviso sobre ${budget.category}`}
            className="-mt-1 -mr-1.5 shrink-0 hover:bg-expense/10"
            onClick={() => dismiss(budget)}
          >
            <IconClose />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
