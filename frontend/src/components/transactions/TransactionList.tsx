import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button, IconButton } from '../ui/Button';
import {
  IconArrowDown,
  IconArrowUp,
  IconPencil,
  IconRepeat,
  IconTransfer,
  IconTrash,
} from '../ui/Icons';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useTransactionDialog } from '../../context/TransactionDialogContext';
import { api, ApiError } from '../../lib/api';
import { formatCurrency, formatRelativeDay, formatSigned } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Transaction } from '../../types/api';

interface DayGroup {
  date: string;
  transactions: Transaction[];
  netCents: number;
}

function groupByDay(transactions: Transaction[]): DayGroup[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const bucket = groups.get(transaction.date);
    if (bucket) bucket.push(transaction);
    else groups.set(transaction.date, [transaction]);
  }

  return [...groups.entries()].map(([date, items]) => ({
    date,
    transactions: items,
    // Transferência não muda o quanto você tem: fica fora do total do dia.
    netCents: items.reduce((sum, item) => {
      if (item.type === 'transfer') return sum;
      return sum + (item.type === 'income' ? item.amountCents : -item.amountCents);
    }, 0),
  }));
}

interface TransactionListProps {
  transactions: Transaction[];
  /** Oculta o resumo do dia e as ações — usado no resumo do dashboard. */
  compact?: boolean;
}

export function TransactionList({ transactions, compact = false }: TransactionListProps) {
  const groups = useMemo(() => groupByDay(transactions), [transactions]);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  return (
    <>
      <div className="flex flex-col">
        {groups.map((group) => (
          <section key={group.date}>
            <header
              className={cn(
                'flex items-baseline justify-between gap-4 border-b border-line px-5 py-2.5 sm:px-6',
                'bg-surface-2/60',
              )}
            >
              <h3 className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                {formatRelativeDay(group.date)}
              </h3>
              {!compact && (
                <span className="tnum text-[12px] text-ink-3">
                  {group.netCents >= 0 ? '+' : '−'} {formatCurrency(Math.abs(group.netCents))}
                </span>
              )}
            </header>

            <ul>
              {group.transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  compact={compact}
                  onDelete={() => setPendingDelete(transaction)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <DeleteDialog transaction={pendingDelete} onClose={() => setPendingDelete(null)} />
    </>
  );
}

interface TransactionRowProps {
  transaction: Transaction;
  compact: boolean;
  onDelete: () => void;
}

function TransactionRow({ transaction, compact, onDelete }: TransactionRowProps) {
  const { openEdit } = useTransactionDialog();
  const income = transaction.type === 'income';
  const transfer = transaction.type === 'transfer';

  return (
    <li className="group flex items-center gap-3.5 border-b border-line px-5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2 sm:px-6">
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl',
          transfer && 'bg-surface-inset text-ink-2',
          !transfer && income && 'bg-income-soft text-income-text',
          !transfer && !income && 'bg-expense-soft text-expense-text',
        )}
      >
        {transfer ? <IconTransfer /> : income ? <IconArrowUp /> : <IconArrowDown />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {transaction.description}
          {transaction.installmentTotal && (
            <span className="tnum ml-1.5 text-[12px] font-normal text-ink-3">
              {transaction.installmentNumber}/{transaction.installmentTotal}
            </span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
          {transaction.recurrenceId && (
            <IconRepeat
              className="size-3 shrink-0"
              role="img"
              aria-label="Criada por uma recorrência"
            />
          )}
          <span className="truncate">
            {transfer ? (
              <>
                {transaction.accountName ?? 'conta removida'}
                <span aria-hidden> → </span>
                {transaction.transferAccountName ?? 'conta removida'}
                <span className="sr-only"> — transferência entre contas</span>
              </>
            ) : (
              <>
                {transaction.category}
                {transaction.accountName && (
                  <>
                    <span aria-hidden> · </span>
                    {transaction.accountName}
                  </>
                )}
                <span className="sr-only"> — {income ? 'entrada' : 'saída'}</span>
              </>
            )}
          </span>
        </p>
      </div>

      <span
        className={cn(
          'tnum shrink-0 text-sm font-semibold whitespace-nowrap',
          transfer && 'text-ink-2',
          !transfer && income && 'text-income-text',
          !transfer && !income && 'text-expense-text',
        )}
      >
        {transaction.type === 'transfer'
          ? formatCurrency(transaction.amountCents)
          : formatSigned(transaction.amountCents, transaction.type)}
      </span>

      {!compact && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <IconButton
            label={`Editar ${transaction.description}`}
            className="size-8"
            onClick={() => openEdit(transaction)}
          >
            <IconPencil />
          </IconButton>
          <IconButton
            label={`Excluir ${transaction.description}`}
            className="size-8 hover:bg-expense-soft hover:text-expense-text"
            onClick={onDelete}
          >
            <IconTrash />
          </IconButton>
        </div>
      )}
    </li>
  );
}

function DeleteDialog({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { refresh } = useFinance();
  const { notify } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [wholePurchase, setWholePurchase] = useState(false);

  const installments = transaction?.installmentTotal ?? 0;

  // Cada abertura do diálogo começa com a escolha mais conservadora.
  useEffect(() => {
    if (transaction) setWholePurchase(false);
  }, [transaction]);

  async function handleDelete(): Promise<void> {
    if (!transaction) return;
    setDeleting(true);
    try {
      if (wholePurchase) {
        const { deleted } = await api.deleteInstallmentGroup(transaction.id);
        notify(`${deleted} parcelas excluídas`);
      } else {
        await api.deleteTransaction(transaction.id);
        notify('Transação excluída');
      }
      refresh();
      onClose();
    } catch (error) {
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível excluir. Tente novamente.',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  }

  const transfer = transaction?.type === 'transfer';

  return (
    <Modal
      open={Boolean(transaction)}
      onClose={onClose}
      size="sm"
      title="Excluir transação?"
      description="O saldo e os gráficos são recalculados na hora. Esta ação não pode ser desfeita."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Excluir
          </Button>
        </>
      }
    >
      {transaction && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
            <p className="text-sm font-medium text-ink">
              {transaction.description}
              {transaction.installmentTotal && (
                <span className="tnum ml-1.5 text-[13px] font-normal text-ink-3">
                  {transaction.installmentNumber}/{transaction.installmentTotal}
                </span>
              )}
            </p>
            <p className="mt-1 text-[13px] text-ink-3">
              {transfer
                ? `${transaction.accountName ?? 'conta removida'} → ${transaction.transferAccountName ?? 'conta removida'}`
                : transaction.category}{' '}
              · {formatRelativeDay(transaction.date)}
            </p>
            <p
              className={cn(
                'tnum mt-2 text-base font-semibold',
                transfer && 'text-ink-2',
                !transfer && transaction.type === 'income' && 'text-income-text',
                !transfer && transaction.type === 'expense' && 'text-expense-text',
              )}
            >
              {transaction.type === 'transfer'
                ? formatCurrency(transaction.amountCents)
                : formatSigned(transaction.amountCents, transaction.type)}
            </p>
          </div>

          {installments > 1 && (
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={wholePurchase}
                onChange={(event) => setWholePurchase(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                Excluir as {installments} parcelas desta compra
                <span className="mt-0.5 block text-xs text-ink-3">
                  Sem marcar, só esta parcela sai — as outras continuam no histórico.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}
