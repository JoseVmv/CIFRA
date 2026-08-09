import type { DatabaseSync } from 'node:sqlite';
import type { Settings } from '../domain/types';

const INITIAL_BALANCE_KEY = 'initial_balance_cents';
const CURRENCY_KEY = 'currency';

const DEFAULTS = {
  initialBalanceCents: 0,
  currency: 'BRL',
} as const;

export interface SettingsUpdate {
  initialBalanceCents?: number;
  currency?: string;
}

export type SettingsService = ReturnType<typeof createSettingsService>;

export function createSettingsService(db: DatabaseSync) {
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

    return {
      initialBalanceCents: Number.isFinite(rawBalance)
        ? Math.trunc(rawBalance)
        : DEFAULTS.initialBalanceCents,
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
