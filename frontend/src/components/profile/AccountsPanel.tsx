import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { IconPlus, IconTrash } from '../ui/Icons';
import { Skeleton } from '../ui/States';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Account } from '../../types/api';

const MAX_NAME_LENGTH = 40;

const NAME_INPUT_CLASS =
  'h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink ' +
  'placeholder:text-ink-3 transition-colors duration-150 ' +
  'hover:border-line-strong focus:border-accent focus:outline-none';

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Lista editável de contas. Cada linha salva sozinha ao sair do campo — não há
 * botão "salvar" global, então o total exibido é sempre o que está no banco.
 */
export function AccountsPanel() {
  const { accounts, refresh } = useFinance();
  const { notify } = useToast();
  const t = useT();

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftCents, setDraftCents] = useState(0);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) draftRef.current?.focus();
  }, [creating]);

  const items = accounts ?? [];
  const totalCents = items.reduce((sum, item) => sum + item.balanceCents, 0);
  const currentTotalCents = items.reduce((sum, item) => sum + item.currentBalanceCents, 0);

  async function addAccount(): Promise<void> {
    const name = draftName.trim();
    if (!name) {
      draftRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      await api.createAccount({ name, balanceCents: draftCents });
      setDraftName('');
      setDraftCents(0);
      refresh();
      draftRef.current?.focus();
    } catch (error) {
      notify(message(error, t.accounts.addFailed), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (accounts === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && !creating && (
        <p className="rounded-xl bg-surface-inset px-4 py-3 text-[13px] text-ink-2">
          {t.accounts.emptyNote}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}
      </ul>

      {creating && (
        <div className="flex items-start gap-2">
          <input
            ref={draftRef}
            value={draftName}
            maxLength={MAX_NAME_LENGTH}
            placeholder={t.accounts.namePlaceholder}
            aria-label={t.accounts.newNameLabel}
            autoComplete="off"
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void addAccount();
              }
              if (event.key === 'Escape') setCreating(false);
            }}
            className={NAME_INPUT_CLASS}
          />
          <div className="w-36 shrink-0">
            <CurrencyInput
              valueCents={draftCents}
              onChangeCents={setDraftCents}
              aria-label={t.accounts.newBalanceLabel}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addAccount();
                }
              }}
            />
          </div>
          <Button
            variant="primary"
            className="h-11 shrink-0"
            loading={saving}
            onClick={() => void addAccount()}
          >
            {t.common.add}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<IconPlus />}
          onClick={() => (creating ? void addAccount() : setCreating(true))}
        >
          {creating ? t.accounts.saveAccount : t.accounts.addAccount}
        </Button>

        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-ink-3">
          <p className="flex items-baseline gap-2">
            {t.accounts.initialTotal}
            <strong className="tnum font-semibold text-ink-2">{formatCurrency(totalCents)}</strong>
          </p>
          {items.length > 0 && (
            <p className="flex items-baseline gap-2">
              {t.accounts.todayTotal}
              <strong className="tnum text-base font-semibold text-ink">
                {formatCurrency(currentTotalCents)}
              </strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  const { refresh } = useFinance();
  const { notify } = useToast();
  const t = useT();

  const [name, setName] = useState(account.name);
  const [balanceCents, setBalanceCents] = useState(account.balanceCents);
  const [busy, setBusy] = useState(false);

  const changed = name.trim() !== account.name || balanceCents !== account.balanceCents;

  async function save(): Promise<void> {
    if (!changed) return;
    if (!name.trim()) {
      setName(account.name); // nome vazio não é salvo: volta ao valor anterior
      return;
    }

    setBusy(true);
    try {
      await api.updateAccount(account.id, { name: name.trim(), balanceCents });
      refresh();
    } catch (error) {
      setName(account.name);
      setBalanceCents(account.balanceCents);
      notify(message(error, t.accounts.saveFailed), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      await api.deleteAccount(account.id);
      notify(t.accounts.removed(account.name));
      refresh();
    } catch (error) {
      notify(message(error, t.accounts.removeFailed), 'error');
    } finally {
      setBusy(false);
    }
  }

  // Sem movimento na conta os dois números são iguais: repetir só faria ruído.
  const moved = account.currentBalanceCents !== account.balanceCents;

  return (
    <li className={cn('flex flex-col gap-1', busy && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <input
          value={name}
          maxLength={MAX_NAME_LENGTH}
          aria-label={t.accounts.nameLabel(account.name)}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          className={NAME_INPUT_CLASS}
        />
        <div className="w-36 shrink-0">
          <CurrencyInput
            valueCents={balanceCents}
            onChangeCents={setBalanceCents}
            aria-label={t.accounts.balanceLabel(account.name)}
            onBlur={() => void save()}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </div>
        <IconButton
          label={t.accounts.removeLabel(account.name)}
          disabled={busy}
          className="shrink-0 hover:bg-expense-soft hover:text-expense-text"
          onClick={() => void remove()}
        >
          <IconTrash />
        </IconButton>
      </div>

      {moved && (
        <p className="pr-[3.25rem] text-right text-xs text-ink-3">
          {t.accounts.balanceToday}{' '}
          <strong className="tnum font-semibold text-ink-2">
            {formatCurrency(account.currentBalanceCents)}
          </strong>
        </p>
      )}
    </li>
  );
}
