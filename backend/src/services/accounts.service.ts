import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError } from '../errors';
import type { Account, AccountInput } from '../domain/types';

interface AccountRow {
  id: string;
  name: string;
  balance_cents: number;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Trava defensiva: ninguém precisa de mais do que isso e evita listas absurdas. */
export const MAX_ACCOUNTS = 30;

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    balanceCents: row.balance_cents,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type AccountsService = ReturnType<typeof createAccountsService>;

export function createAccountsService(db: DatabaseSync) {
  const selectAll = db.prepare(
    'SELECT * FROM accounts ORDER BY position ASC, created_at ASC',
  );
  const selectById = db.prepare('SELECT * FROM accounts WHERE id = ?');
  const insert = db.prepare(
    `INSERT INTO accounts (id, name, balance_cents, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare(
    'UPDATE accounts SET name = ?, balance_cents = ?, updated_at = ? WHERE id = ?',
  );
  const deleteStatement = db.prepare('DELETE FROM accounts WHERE id = ?');

  function list(): Account[] {
    return (selectAll.all() as unknown as AccountRow[]).map(toAccount);
  }

  function getById(id: string): Account {
    const row = selectById.get(id) as AccountRow | undefined;
    if (!row) throw new NotFoundError('Conta não encontrada.');
    return toAccount(row);
  }

  function count(): number {
    const row = db.prepare('SELECT COUNT(*) AS total FROM accounts').get() as { total: number };
    return row.total;
  }

  function create(input: AccountInput): Account {
    const now = new Date().toISOString();
    const id = randomUUID();
    const nextPosition = (
      db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM accounts').get() as {
        next: number;
      }
    ).next;

    insert.run(id, input.name, input.balanceCents, nextPosition, now, now);
    return getById(id);
  }

  function update(id: string, input: AccountInput): Account {
    getById(id); // garante 404 antes de escrever
    updateStatement.run(input.name, input.balanceCents, new Date().toISOString(), id);
    return getById(id);
  }

  function remove(id: string): void {
    const result = deleteStatement.run(id);
    if (result.changes === 0) throw new NotFoundError('Conta não encontrada.');
  }

  /** Soma de todas as contas — é o saldo inicial quando o modo está ativo. */
  function totalBalanceCents(): number {
    const row = db.prepare('SELECT COALESCE(SUM(balance_cents), 0) AS total FROM accounts').get() as {
      total: number;
    };
    return row.total;
  }

  return { list, getById, create, update, remove, count, totalBalanceCents };
}
