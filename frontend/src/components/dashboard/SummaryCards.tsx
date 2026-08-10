import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/States';
import { IconArrowDown, IconArrowUp, IconScales, IconWallet } from '../ui/Icons';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Summary } from '../../types/api';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: 'neutral' | 'income' | 'expense';
  emphasis?: boolean;
}

function StatCard({ label, value, hint, icon, tone = 'neutral', emphasis = false }: StatCardProps) {
  return (
    <Card className={cn('p-5', emphasis && 'surface-tinted')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-3">{label}</p>
        <span
          aria-hidden
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg text-[13px]',
            tone === 'income' && 'bg-income-soft text-income-text',
            tone === 'expense' && 'bg-expense-soft text-expense-text',
            tone === 'neutral' && 'bg-surface-inset text-ink-3',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'mt-3.5 font-semibold tracking-[-0.025em]',
          emphasis ? 'text-[30px] leading-none' : 'text-[24px] leading-none',
          tone === 'income' && 'text-income-text',
          tone === 'expense' && 'text-expense-text',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="size-7 rounded-lg" />
      </div>
      <Skeleton className="mt-4 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-24" />
    </Card>
  );
}

interface SummaryCardsProps {
  summary: Summary | null;
  periodLabel: string;
  loading: boolean;
}

export function SummaryCards({ summary, periodLabel, loading }: SummaryCardsProps) {
  if (loading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  }

  const positive = summary.netCents >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Saldo atual"
        value={formatCurrency(summary.currentBalanceCents)}
        hint={`Inclui ${formatCurrency(summary.initialBalanceCents)} de saldo inicial`}
        icon={<IconWallet />}
        emphasis
      />
      <StatCard
        label="Entradas"
        value={formatCurrency(summary.incomeCents)}
        hint={periodLabel}
        icon={<IconArrowUp />}
        tone="income"
      />
      <StatCard
        label="Saídas"
        value={formatCurrency(summary.expenseCents)}
        hint={periodLabel}
        icon={<IconArrowDown />}
        tone="expense"
      />
      <StatCard
        label="Resultado"
        value={`${positive ? '+' : '−'} ${formatCurrency(Math.abs(summary.netCents))}`}
        hint={positive ? 'Você guardou dinheiro no período' : 'Você gastou mais do que recebeu'}
        icon={<IconScales />}
        tone={positive ? 'income' : 'expense'}
      />
    </div>
  );
}
