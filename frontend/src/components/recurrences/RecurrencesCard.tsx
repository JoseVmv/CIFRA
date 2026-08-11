import { useState } from 'react';
import { RecurrenceDialog } from './RecurrenceDialog';
import { Card, CardHeader } from '../ui/Card';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/States';
import { IconPause, IconPencil, IconPlay, IconPlus, IconRepeat, IconTrash } from '../ui/Icons';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useApiResource } from '../../hooks/useApiResource';
import { api, ApiError } from '../../lib/api';
import { formatDayMonth, formatSigned } from '../../lib/format';
import { describeSchedule, toRecurrenceInput } from '../../lib/recurrence';
import { cn } from '../../lib/cn';
import type { Recurrence } from '../../types/api';

/**
 * As regras que lançam sozinhas. O card fica no histórico porque é lá que os
 * lançamentos gerados aparecem — a regra e o resultado dela lado a lado.
 */
export function RecurrencesCard() {
  const { version, refresh } = useFinance();
  const { notify } = useToast();

  const recurrences = useApiResource(() => api.listRecurrences(), [version]);
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const items = recurrences.data?.items ?? [];

  function openNew(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(recurrence: Recurrence): void {
    setEditing(recurrence);
    setDialogOpen(true);
  }

  async function toggleActive(recurrence: Recurrence): Promise<void> {
    try {
      await api.updateRecurrence(recurrence.id, {
        ...toRecurrenceInput(recurrence),
        active: !recurrence.active,
      });
      notify(recurrence.active ? 'Recorrência pausada' : 'Recorrência retomada');
      refresh();
    } catch (error) {
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível alterar a recorrência.',
        'error',
      );
    }
  }

  async function remove(recurrence: Recurrence): Promise<void> {
    try {
      await api.deleteRecurrence(recurrence.id);
      notify(`Recorrência "${recurrence.description}" removida`);
      refresh();
    } catch (error) {
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível remover a recorrência.',
        'error',
      );
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Lançamentos recorrentes"
          description="O app registra sozinho quando a data chega — salário, aluguel, assinaturas."
          action={
            items.length > 0 && (
              <Button size="sm" variant="secondary" icon={<IconPlus />} onClick={openNew}>
                Nova recorrência
              </Button>
            )
          }
        />

        <div className="px-5 pt-4 pb-5 sm:px-6">
          {recurrences.isInitialLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1].map((index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<IconRepeat />}
              title="Nenhuma recorrência"
              description="Cadastre o que se repete todo mês e não precise lançar de novo. Você continua podendo editar ou apagar cada transação criada."
              action={
                <Button variant="primary" icon={<IconPlus />} onClick={openNew}>
                  Criar recorrência
                </Button>
              }
              className="py-6"
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {items.map((recurrence) => (
                <RecurrenceRow
                  key={recurrence.id}
                  recurrence={recurrence}
                  onEdit={() => openEdit(recurrence)}
                  onToggle={() => void toggleActive(recurrence)}
                  onRemove={() => void remove(recurrence)}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <RecurrenceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        recurrence={editing}
      />
    </>
  );
}

interface RecurrenceRowProps {
  recurrence: Recurrence;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}

function RecurrenceRow({ recurrence, onEdit, onToggle, onRemove }: RecurrenceRowProps) {
  const income = recurrence.type === 'income';

  return (
    <li className="group flex flex-wrap items-center gap-x-3.5 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className={cn('min-w-0 flex-1', !recurrence.active && 'opacity-55')}>
        <p className="truncate text-sm font-medium text-ink">{recurrence.description}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-3">
          {describeSchedule(recurrence)}
          <span aria-hidden> · </span>
          {recurrence.category}
          {recurrence.accountName && (
            <>
              <span aria-hidden> · </span>
              {recurrence.accountName}
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span
          className={cn(
            'tnum text-sm font-semibold whitespace-nowrap',
            !recurrence.active && 'opacity-55',
            income ? 'text-income-text' : 'text-expense-text',
          )}
        >
          {formatSigned(recurrence.amountCents, recurrence.type)}
        </span>
        <span className="text-[11px] text-ink-3">
          {!recurrence.active
            ? 'Pausada'
            : recurrence.nextDate
              ? `Próximo em ${formatDayMonth(recurrence.nextDate)}`
              : 'Encerrada'}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <IconButton
          label={
            recurrence.active
              ? `Pausar recorrência ${recurrence.description}`
              : `Retomar recorrência ${recurrence.description}`
          }
          className="size-8"
          onClick={onToggle}
        >
          {recurrence.active ? <IconPause /> : <IconPlay />}
        </IconButton>
        <IconButton
          label={`Editar recorrência ${recurrence.description}`}
          className="size-8"
          onClick={onEdit}
        >
          <IconPencil />
        </IconButton>
        <IconButton
          label={`Remover recorrência ${recurrence.description}`}
          className="size-8 hover:bg-expense-soft hover:text-expense-text"
          onClick={onRemove}
        >
          <IconTrash />
        </IconButton>
      </div>
    </li>
  );
}
