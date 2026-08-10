import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError } from '../errors';
import type {
  Paginated,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionType,
} from '../domain/types';

interface TransactionRow {
  id: string;
  type: TransactionType;
  amount_cents: number;
  description: string;
  category: string;
  date: string;
  created_at: string;
  updated_at: string;
}

const MAX_PAGE_SIZE = 500;

/** Marcas de acentuação que o `normalize('NFD')` separa das letras. */
const DIACRITICS = /[̀-ͯ]/g;

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    description: row.description,
    category: row.category,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Texto usado na busca: minúsculo e sem acentos, para que "cafe" encontre "Café".
 * SQLite sozinho não faz isso (o `LIKE` nativo só é case-insensitive em ASCII).
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .trim();
}

/** Escapa os curingas do LIKE para que `%` e `_` digitados sejam literais. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

interface WhereClause {
  sql: string;
  params: Array<string | number>;
}

function buildWhere(filters: TransactionFilters): WhereClause {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters.from) {
    conditions.push('date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('date <= ?');
    params.push(filters.to);
  }
  const search = filters.search ? normalizeSearch(filters.search) : '';
  if (search) {
    conditions.push("search_text LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(search)}%`);
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export type TransactionsService = ReturnType<typeof createTransactionsService>;

export function createTransactionsService(db: DatabaseSync) {
  const selectById = db.prepare('SELECT * FROM transactions WHERE id = ?');
  const insert = db.prepare(
    `INSERT INTO transactions
       (id, type, amount_cents, description, category, date, search_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare(
    `UPDATE transactions
        SET type = ?, amount_cents = ?, description = ?, category = ?, date = ?,
            search_text = ?, updated_at = ?
      WHERE id = ?`,
  );
  const deleteStatement = db.prepare('DELETE FROM transactions WHERE id = ?');

  function findById(id: string): Transaction | null {
    const row = selectById.get(id) as TransactionRow | undefined;
    return row ? toTransaction(row) : null;
  }

  function getById(id: string): Transaction {
    const transaction = findById(id);
    if (!transaction) {
      throw new NotFoundError('Transação não encontrada.');
    }
    return transaction;
  }

  function list(filters: TransactionFilters = {}): Paginated<Transaction> {
    const where = buildWhere(filters);
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), MAX_PAGE_SIZE);
    const offset = Math.max(filters.offset ?? 0, 0);

    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM transactions ${where.sql}`)
      .get(...where.params) as { total: number };

    const rows = db
      .prepare(
        `SELECT * FROM transactions ${where.sql}
         ORDER BY date DESC, created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.params, limit, offset) as unknown as TransactionRow[];

    return { items: rows.map(toTransaction), total: countRow.total, limit, offset };
  }

  function create(input: TransactionInput): Transaction {
    const now = new Date().toISOString();
    const id = randomUUID();
    insert.run(
      id,
      input.type,
      input.amountCents,
      input.description,
      input.category,
      input.date,
      normalizeSearch(`${input.description} ${input.category}`),
      now,
      now,
    );
    return getById(id);
  }

  function update(id: string, input: TransactionInput): Transaction {
    getById(id); // garante 404 antes de tentar escrever
    updateStatement.run(
      input.type,
      input.amountCents,
      input.description,
      input.category,
      input.date,
      normalizeSearch(`${input.description} ${input.category}`),
      new Date().toISOString(),
      id,
    );
    return getById(id);
  }

  function remove(id: string): void {
    const result = deleteStatement.run(id);
    if (result.changes === 0) {
      throw new NotFoundError('Transação não encontrada.');
    }
  }

  /** Categorias já usadas pelo usuário, para alimentar os filtros da interface. */
  function categoriesInUse(): Array<{ category: string; type: TransactionType; count: number }> {
    return db
      .prepare(
        `SELECT category, type, COUNT(*) AS count
           FROM transactions
          GROUP BY category, type
          ORDER BY count DESC, category ASC`,
      )
      .all() as Array<{ category: string; type: TransactionType; count: number }>;
  }

  function earliestDate(): string | null {
    const row = db.prepare('SELECT MIN(date) AS earliest FROM transactions').get() as {
      earliest: string | null;
    };
    return row.earliest ?? null;
  }

  function latestDate(): string | null {
    const row = db.prepare('SELECT MAX(date) AS latest FROM transactions').get() as {
      latest: string | null;
    };
    return row.latest ?? null;
  }

  function count(): number {
    const row = db.prepare('SELECT COUNT(*) AS total FROM transactions').get() as { total: number };
    return row.total;
  }

  return {
    list,
    findById,
    getById,
    create,
    update,
    remove,
    categoriesInUse,
    earliestDate,
    latestDate,
    count,
  };
}
