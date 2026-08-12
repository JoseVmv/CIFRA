import type { DatabaseSync } from 'node:sqlite';
import {
  CURRENCIES,
  LANGUAGES,
  type Currency,
  type Language,
  type Settings,
} from '../domain/types';
import type { AccountsService } from './accounts.service';

const INITIAL_BALANCE_KEY = 'initial_balance_cents';
const USE_MULTIPLE_ACCOUNTS_KEY = 'use_multiple_accounts';
const DISPLAY_NAME_KEY = 'display_name';
const CURRENCY_KEY = 'currency';
const LANGUAGE_KEY = 'language';

const DEFAULTS = {
  initialBalanceCents: 0,
  useMultipleAccounts: false,
  displayName: '',
  currency: 'BRL',
  language: 'pt',
} as const;

export interface SettingsUpdate {
  initialBalanceCents?: number;
  useMultipleAccounts?: boolean;
  displayName?: string;
  currency?: Currency;
  language?: Language;
}

/** Um valor fora da lista (banco editado à mão, versão antiga) cai no padrão. */
function toLanguage(value: string | undefined): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : DEFAULTS.language;
}

function toCurrency(value: string | undefined): Currency {
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : DEFAULTS.currency;
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
      currency: toCurrency(rows.get(CURRENCY_KEY)?.value),
      language: toLanguage(rows.get(LANGUAGE_KEY)?.value),
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
    if (input.language !== undefined) {
      upsert.run(LANGUAGE_KEY, input.language, now);
    }
    return get();
  }

  function getInitialBalanceCents(): number {
    return get().initialBalanceCents;
  }

  return { get, update, getInitialBalanceCents };
}
