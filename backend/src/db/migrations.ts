import type { DatabaseSync } from 'node:sqlite';

/**
 * Migrations incrementais controladas por `PRAGMA user_version`.
 * Para evoluir o schema, basta acrescentar uma nova string ao final do array —
 * nunca editar as anteriores.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE transactions (
    id           TEXT PRIMARY KEY,
    type         TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    description  TEXT    NOT NULL CHECK (length(description) BETWEEN 1 AND 140),
    category     TEXT    NOT NULL CHECK (length(category) BETWEEN 1 AND 40),
    date         TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    search_text  TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );

  CREATE INDEX idx_transactions_date ON transactions (date DESC);
  CREATE INDEX idx_transactions_type_date ON transactions (type, date);
  CREATE INDEX idx_transactions_category ON transactions (category);
  `,

  // 2. Contas nomeadas: quando ativadas, o saldo inicial passa a ser a soma delas.
  `
  CREATE TABLE accounts (
    id            TEXT PRIMARY KEY,
    name          TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
    balance_cents INTEGER NOT NULL DEFAULT 0,
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
  );

  CREATE INDEX idx_accounts_position ON accounts (position, created_at);
  `,
];

export function runMigrations(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const currentVersion = row?.user_version ?? 0;

  for (let version = currentVersion; version < MIGRATIONS.length; version += 1) {
    const migration = MIGRATIONS[version];
    if (!migration) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration);
      // user_version não aceita parâmetro ligado; o valor é um inteiro nosso.
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
