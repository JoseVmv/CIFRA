import type { DatabaseSync } from 'node:sqlite';
import type { Settings } from '../domain/types';
import type { AccountsService } from './accounts.service';

const INITIAL_BALANCE_KEY = 'initial_balance_cents';
const USE_MULTIPLE_ACCOUNTS_KEY = 'use_multiple_accounts';
const DISPLAY_NAME_KEY = 'display_name';
const CURRENCY_KEY = 'currency';

const DEFAULTS = {
  initialBalanceCents: 0,
  useMultipleAccounts: false,
  displayName: '',
  currency: 'BRL',
} as const;

export interface SettingsUpdate {
  initialBalanceCents?: number;
  useMultipleAccounts?: boolean;
  displayName?: string;
  currency?: string;
}

export type SettingsService = ReturnType<typeof createSettingsService>;

export function createSettingsService(db: DatabaseSync, accounts: AccountsService) {
  const selectAll = db.prepare('SELECT key, value, updated_at FROM settings');
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );

  function readRows(): Map<string, { value: string; updatedAt: string }> {
    const rows = selectAll.all() as Array<{ key: string; value: string; updated_at: string }>;
    return new Map(rows.map((row) => [row.key, { value: row.value, updatedAt: row.updated_at }]));
  }

  function get(): Settings {
    const rows = readRows();
    const rawBalance = Number(rows.get(INITIAL_BALANCE_KEY)?.value);
    const updatedAt = [...rows.values()].map((row) => row.updatedAt).sort().at(-1);

    const manualInitialBalanceCents = Number.isFinite(rawBalance)
      ? Math.trunc(rawBalance)
      : DEFAULTS.initialBalanceCents;
    const useMultipleAccounts = rows.get(USE_MULTIPLE_ACCOUNTS_KEY)?.value === 'true';
    const accountsTotalCents = accounts.totalBalanceCents();

    return {
      // Com múltiplas contas ativas, a soma das contas manda; o valor digitado
      // continua guardado para voltar a valer se a opção for desmarcada.
      initialBalanceCents: useMultipleAccounts ? accountsTotalCents : manualInitialBalanceCents,
      manualInitialBalanceCents,
      useMultipleAccounts,
      accountsTotalCents,
      displayName: rows.get(DISPLAY_NAME_KEY)?.value ?? DEFAULTS.displayName,
      currency: rows.get(CURRENCY_KEY)?.value ?? DEFAULTS.currency,
      updatedAt: updatedAt ?? new Date(0).toISOString(),
    };
  }

  /** Atualiza apenas as chaves informadas. O histórico nunca é tocado. */
  function update(input: SettingsUpdate): Settings {
    const now = new Date().toISOString();
    if (input.initialBalanceCents !== undefined) {
      upsert.run(INITIAL_BALANCE_KEY, String(Math.trunc(input.initialBalanceCents)), now);
    }
    if (input.useMultipleAccounts !== undefined) {
      upsert.run(USE_MULTIPLE_ACCOUNTS_KEY, input.useMultipleAccounts ? 'true' : 'false', now);
    }
    if (input.displayName !== undefined) {
      upsert.run(DISPLAY_NAME_KEY, input.displayName, now);
    }
    if (input.currency !== undefined) {
      upsert.run(CURRENCY_KEY, input.currency, now);
    }
    return get();
  }

  function getInitialBalanceCents(): number {
    return get().initialBalanceCents;
  }

  return { get, update, getInitialBalanceCents };
}
