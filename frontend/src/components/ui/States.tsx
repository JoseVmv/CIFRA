import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

/** Nenhuma tela fica vazia sem explicação — sempre há um título, um porquê e uma saída. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <span className="grid size-11 place-items-center rounded-xl bg-surface-inset text-lg text-ink-3">
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-ink-3">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-inset', className)} />;
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  const t = useT();

  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <p className="text-sm text-ink">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-[13px] font-medium text-accent underline underline-offset-4 hover:opacity-80"
        >
          {t.common.retry}
        </button>
      )}
    </div>
  );
}
