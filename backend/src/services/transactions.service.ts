import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { addMonths } from '../domain/dates';
import { NotFoundError, ValidationError } from '../errors';
import {
  TRANSFER_CATEGORY,
  type InstallmentInput,
  type Paginated,
  type Transaction,
  type TransactionFilters,
  type TransactionInput,
  type TransactionType,
} from '../domain/types';

interface TransactionRow {
  id: string;
  type: TransactionType;
  amount_cents: number;
  description: string;
  category: string;
  date: string;
  account_id: string | null;
  account_name: string | null;
  transfer_account_id: string | null;
  transfer_account_name: string | null;
  recurrence_id: string | null;
  installment_group: string | null;
  installment_number: number | null;
  installment_total: number | null;
  created_at: string;
  updated_at: string;
}

const MAX_PAGE_SIZE = 500;

/** Teto de parcelas — quatro anos de carnê já é mais do que qualquer loja faz. */
export const MAX_INSTALLMENTS = 48;

/** Marcas de acentuação que o `normalize('NFD')` separa das letras. */
const DIACRITICS = /[̀-ͯ]/g;

/** Colunas + os nomes das contas envolvidas, resolvidos por junção. */
const SELECT_BASE = `
  SELECT t.*,
         origem.name  AS account_name,
         destino.name AS transfer_account_name
    FROM transactions t
    LEFT JOIN accounts origem  ON origem.id  = t.account_id
    LEFT JOIN accounts destino ON destino.id = t.transfer_account_id`;

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    description: row.description,
    category: row.category,
    date: row.date,
    accountId: row.account_id,
    accountName: row.account_name,
    transferAccountId: row.transfer_account_id,
    transferAccountName: row.transfer_account_name,
    recurrenceId: row.recurrence_id,
    installmentGroup: row.installment_group,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Divide um total em parcelas iguais e devolve os centavos de cada uma.
 * A sobra da divisão vai para a primeira — é como as lojas fazem, e evita que
 * a soma das parcelas fique diferente do total da compra.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => (index === 0 ? base + remainder : base));
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
    conditions.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters.category) {
    conditions.push('t.category = ?');
    params.push(filters.category);
  }
  if (filters.accountId) {
    conditions.push('t.account_id = ?');
    params.push(filters.accountId);
  }
  if (filters.from) {
    conditions.push('t.date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('t.date <= ?');
    params.push(filters.to);
  }
  const search = filters.search ? normalizeSearch(filters.search) : '';
  if (search) {
    conditions.push("t.search_text LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(search)}%`);
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export type TransactionsService = ReturnType<typeof createTransactionsService>;

export function createTransactionsService(db: DatabaseSync) {
  const selectById = db.prepare(`${SELECT_BASE} WHERE t.id = ?`);
  const insert = db.prepare(
    `INSERT INTO transactions
       (id, type, amount_cents, description, category, date, account_id, transfer_account_id,
        recurrence_id, installment_group, installment_number, installment_total,
        search_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare(
    `UPDATE transactions
        SET type = ?, amount_cents = ?, description = ?, category = ?, date = ?,
            account_id = ?, transfer_account_id = ?, search_text = ?, updated_at = ?
      WHERE id = ?`,
  );
  const deleteStatement = db.prepare('DELETE FROM transactions WHERE id = ?');
  const deleteGroupStatement = db.prepare('DELETE FROM transactions WHERE installment_group = ?');
  const accountExists = db.prepare('SELECT 1 AS found FROM accounts WHERE id = ?');

  /** Devolve o id validado, ou `null` quando a transação não tem conta. */
  function resolveAccountId(accountId: string | null | undefined): string | null {
    if (!accountId) return null;
    if (!accountExists.get(accountId)) {
      throw new ValidationError('A conta escolhida não existe mais. Selecione outra.');
    }
    return accountId;
  }

  /**
   * Uma transferência precisa de origem e destino, e eles têm de ser diferentes.
   * Nos outros tipos o destino simplesmente não existe.
   */
  function resolveTransfer(input: TransactionInput): {
    accountId: string | null;
    transferAccountId: string | null;
    category: string;
  } {
    const accountId = resolveAccountId(input.accountId);

    if (input.type !== 'transfer') {
      return { accountId, transferAccountId: null, category: input.category };
    }

    const transferAccountId = resolveAccountId(input.transferAccountId);
    if (!accountId || !transferAccountId) {
      throw new ValidationError('Escolha a conta de origem e a de destino da transferência.');
    }
    if (accountId === transferAccountId) {
      throw new ValidationError('A conta de destino precisa ser diferente da de origem.');
    }

    // A categoria de uma transferência é sempre a mesma: ela não é um gasto.
    return { accountId, transferAccountId, category: TRANSFER_CATEGORY };
  }

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
      .prepare(`SELECT COUNT(*) AS total FROM transactions t ${where.sql}`)
      .get(...where.params) as { total: number };

    const rows = db
      .prepare(
        `${SELECT_BASE} ${where.sql}
         ORDER BY t.date DESC, t.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.params, limit, offset) as unknown as TransactionRow[];

    return { items: rows.map(toTransaction), total: countRow.total, limit, offset };
  }

  interface InsertOptions {
    installmentGroup?: string;
    installmentNumber?: number;
    installmentTotal?: number;
  }

  function insertRow(input: TransactionInput, options: InsertOptions = {}): string {
    const now = new Date().toISOString();
    const id = randomUUID();
    const resolved = resolveTransfer(input);

    insert.run(
      id,
      input.type,
      input.amountCents,
      input.description,
      resolved.category,
      input.date,
      resolved.accountId,
      resolved.transferAccountId,
      input.recurrenceId ?? null,
      options.installmentGroup ?? null,
      options.installmentNumber ?? null,
      options.installmentTotal ?? null,
      normalizeSearch(`${input.description} ${resolved.category}`),
      now,
      now,
    );
    return id;
  }

  function create(input: TransactionInput): Transaction {
    return getById(insertRow(input));
  }

  /**
   * Cria a compra parcelada inteira de uma vez: uma transação por mês, a partir
   * da data informada. Ver todas as parcelas no histórico é o que torna o
   * compromisso visível — cada uma continua editável e apagável sozinha.
   */
  function createInstallments(input: InstallmentInput): Transaction[] {
    const count = input.installments;
    const amounts =
      input.amountIs === 'total'
        ? splitInstallments(input.amountCents, count)
        : Array.from({ length: count }, () => input.amountCents);

    const group = randomUUID();
    const ids: string[] = [];

    db.exec('BEGIN');
    try {
      for (let index = 0; index < count; index += 1) {
        ids.push(
          insertRow(
            {
              ...input,
              amountCents: amounts[index] as number,
              date: addMonths(input.date, index),
            },
            { installmentGroup: group, installmentNumber: index + 1, installmentTotal: count },
          ),
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return ids.map(getById);
  }

  /** `recurrence_id` e as parcelas ficam de fora: editar não apaga a origem. */
  function update(id: string, input: TransactionInput): Transaction {
    getById(id); // garante 404 antes de tentar escrever
    const resolved = resolveTransfer(input);

    updateStatement.run(
      input.type,
      input.amountCents,
      input.description,
      resolved.category,
      input.date,
      resolved.accountId,
      resolved.transferAccountId,
      normalizeSearch(`${input.description} ${resolved.category}`),
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

  /**
   * Apaga a compra parcelada inteira — inclusive as parcelas já passadas.
   * Devolve quantas sumiram. Numa transação sem grupo, apaga só ela.
   */
  function removeInstallmentGroup(id: string): number {
    const transaction = getById(id);
    if (!transaction.installmentGroup) {
      remove(id);
      return 1;
    }
    return Number(deleteGroupStatement.run(transaction.installmentGroup).changes);
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
    createInstallments,
    update,
    remove,
    removeInstallmentGroup,
    categoriesInUse,
    earliestDate,
    latestDate,
    count,
  };
}
