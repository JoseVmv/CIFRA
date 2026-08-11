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

  // 3. Vínculo opcional entre transação e conta. Apagar a conta não apaga o
  //    lançamento: ele apenas deixa de estar vinculado.
  `
  ALTER TABLE transactions
    ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;

  CREATE INDEX idx_transactions_account ON transactions (account_id);
  `,

  // 4. Limites de gasto por categoria, cada um com sua janela em meses.
  `
  CREATE TABLE budgets (
    id          TEXT PRIMARY KEY,
    category    TEXT    NOT NULL UNIQUE CHECK (length(category) BETWEEN 1 AND 40),
    limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
    months      INTEGER NOT NULL CHECK (months BETWEEN 1 AND 24),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  `,

  // 5. Recorrências: moldes que viram transações de verdade quando a data chega.
  //    `day_of_month`, `weekday` e `month_of_year` existem sempre; qual deles vale
  //    depende de `frequency`.
  `
  CREATE TABLE recurrences (
    id            TEXT PRIMARY KEY,
    type          TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
    description   TEXT    NOT NULL CHECK (length(description) BETWEEN 1 AND 140),
    category      TEXT    NOT NULL CHECK (length(category) BETWEEN 1 AND 40),
    account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    frequency     TEXT    NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    day_of_month  INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    month_of_year INTEGER NOT NULL CHECK (month_of_year BETWEEN 1 AND 12),
    start_date    TEXT    NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    end_date      TEXT,
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    -- Marca d'água: até esta data a regra já foi considerada. Nada é criado
    -- antes dela, então apagar um lançamento gerado não o faz voltar.
    last_run_date TEXT,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
  );

  ALTER TABLE transactions
    ADD COLUMN recurrence_id TEXT REFERENCES recurrences(id) ON DELETE SET NULL;

  -- Uma regra cai no máximo uma vez por dia: o índice impede lançamento repetido.
  CREATE UNIQUE INDEX idx_transactions_recurrence_date
      ON transactions (recurrence_id, date)
   WHERE recurrence_id IS NOT NULL;
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
