import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { addMonths, endOfMonth, startOfMonth, today } from '../domain/dates';
import { AppError, NotFoundError } from '../errors';
import {
  BUDGET_WARNING_PERCENT,
  type Budget,
  type BudgetInput,
  type BudgetStatus,
  type BudgetUsage,
} from '../domain/types';

interface BudgetRow {
  id: string;
  category: string;
  limit_cents: number;
  months: number;
  created_at: string;
  updated_at: string;
}

export const MAX_BUDGETS = 20;

function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    category: row.category,
    limitCents: row.limit_cents,
    months: row.months,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function statusFor(percent: number): BudgetStatus {
  if (percent > 100) return 'exceeded';
  if (percent >= BUDGET_WARNING_PERCENT) return 'warning';
  return 'ok';
}

export type BudgetsService = ReturnType<typeof createBudgetsService>;

export function createBudgetsService(db: DatabaseSync) {
  const selectAll = db.prepare('SELECT * FROM budgets ORDER BY created_at ASC');
  const selectById = db.prepare('SELECT * FROM budgets WHERE id = ?');
  const selectByCategory = db.prepare('SELECT * FROM budgets WHERE category = ?');
  const insert = db.prepare(
    `INSERT INTO budgets (id, category, limit_cents, months, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare(
    'UPDATE budgets SET category = ?, limit_cents = ?, months = ?, updated_at = ? WHERE id = ?',
  );
  const deleteStatement = db.prepare('DELETE FROM budgets WHERE id = ?');
  const spentInWindow = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS spent
       FROM transactions
      WHERE type = 'expense' AND category = ? AND date >= ? AND date <= ?`,
  );

  function list(): Budget[] {
    return (selectAll.all() as unknown as BudgetRow[]).map(toBudget);
  }

  function getById(id: string): Budget {
    const row = selectById.get(id) as BudgetRow | undefined;
    if (!row) throw new NotFoundError('Limite não encontrado.');
    return toBudget(row);
  }

  function count(): number {
    const row = db.prepare('SELECT COUNT(*) AS total FROM budgets').get() as { total: number };
    return row.total;
  }

  /** Só faz sentido um limite por categoria — dois valores para o mesmo gasto se contradizem. */
  function assertCategoryIsFree(category: string, exceptId?: string): void {
    const existing = selectByCategory.get(category) as BudgetRow | undefined;
    if (existing && existing.id !== exceptId) {
      throw new AppError(
        409,
        'BUDGET_ALREADY_EXISTS',
        `Já existe um limite para ${category}. Edite o que já está lá.`,
      );
    }
  }

  function create(input: BudgetInput): Budget {
    if (count() >= MAX_BUDGETS) {
      throw new AppError(409, 'TOO_MANY_BUDGETS', `O limite é de ${MAX_BUDGETS} categorias.`);
    }
    assertCategoryIsFree(input.category);

    const now = new Date().toISOString();
    const id = randomUUID();
    insert.run(id, input.category, input.limitCents, input.months, now, now);
    return getById(id);
  }

  function update(id: string, input: BudgetInput): Budget {
    getById(id);
    assertCategoryIsFree(input.category, id);
    updateStatement.run(
      input.category,
      input.limitCents,
      input.months,
      new Date().toISOString(),
      id,
    );
    return getById(id);
  }

  function remove(id: string): void {
    const result = deleteStatement.run(id);
    if (result.changes === 0) throw new NotFoundError('Limite não encontrado.');
  }

  /**
   * Consumo de cada limite na sua própria janela, que termina no mês de
   * referência — navegar para outro mês mostra o consumo daquele período.
   */
  function listWithUsage(reference?: string): BudgetUsage[] {
    const anchor = reference ?? today();

    return list().map((budget) => {
      const from = startOfMonth(addMonths(anchor, -(budget.months - 1)));
      const to = endOfMonth(anchor);
      const { spent } = spentInWindow.get(budget.category, from, to) as { spent: number };

      const percent = Math.round((spent / budget.limitCents) * 1000) / 10;

      return {
        ...budget,
        window: { from, to },
        spentCents: spent,
        remainingCents: budget.limitCents - spent,
        percent,
        status: statusFor(percent),
      };
    });
  }

  return { list, listWithUsage, getById, create, update, remove, count };
}
