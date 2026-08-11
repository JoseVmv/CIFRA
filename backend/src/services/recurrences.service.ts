import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { today, weekdayOf } from '../domain/dates';
import { nextOccurrence, occurrencesBetween, pendingFrom } from '../domain/recurrence';
import { AppError, NotFoundError, ValidationError } from '../errors';
import type {
  Recurrence,
  RecurrenceFrequency,
  RecurrenceInput,
  RecurrenceView,
  TransactionType,
} from '../domain/types';
import type { TransactionsService } from './transactions.service';

interface RecurrenceRow {
  id: string;
  type: TransactionType;
  amount_cents: number;
  description: string;
  category: string;
  account_id: string | null;
  account_name: string | null;
  frequency: RecurrenceFrequency;
  day_of_month: number;
  weekday: number;
  month_of_year: number;
  start_date: string;
  end_date: string | null;
  active: number;
  last_run_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Trava defensiva: uma lista maior do que isso já não é gerenciável. */
export const MAX_RECURRENCES = 40;

const SELECT_BASE = `
  SELECT r.*, a.name AS account_name
    FROM recurrences r
    LEFT JOIN accounts a ON a.id = r.account_id`;

function toRecurrence(row: RecurrenceRow): Recurrence {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    description: row.description,
    category: row.category,
    accountId: row.account_id,
    frequency: row.frequency,
    dayOfMonth: row.day_of_month,
    weekday: row.weekday,
    month: row.month_of_year,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active === 1,
    lastRunDate: row.last_run_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** O que a regra ainda vai lançar num dia — o mapa da projeção do gráfico. */
export interface PendingTotals {
  incomeCents: number;
  expenseCents: number;
}

export type RecurrencesService = ReturnType<typeof createRecurrencesService>;

export function createRecurrencesService(db: DatabaseSync, transactions: TransactionsService) {
  const selectAll = db.prepare(`${SELECT_BASE} ORDER BY r.created_at ASC`);
  const selectById = db.prepare(`${SELECT_BASE} WHERE r.id = ?`);
  const insert = db.prepare(
    `INSERT INTO recurrences
       (id, type, amount_cents, description, category, account_id, frequency,
        day_of_month, weekday, month_of_year, start_date, end_date, active,
        last_run_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare(
    `UPDATE recurrences
        SET type = ?, amount_cents = ?, description = ?, category = ?, account_id = ?,
            frequency = ?, day_of_month = ?, weekday = ?, month_of_year = ?,
            start_date = ?, end_date = ?, active = ?, updated_at = ?
      WHERE id = ?`,
  );
  const deleteStatement = db.prepare('DELETE FROM recurrences WHERE id = ?');
  const markConsidered = db.prepare(
    `UPDATE recurrences SET last_run_date = ?
      WHERE id = ? AND (last_run_date IS NULL OR last_run_date < ?)`,
  );
  const accountExists = db.prepare('SELECT 1 AS found FROM accounts WHERE id = ?');

  function rows(): Recurrence[] {
    return (selectAll.all() as unknown as RecurrenceRow[]).map(toRecurrence);
  }

  function findRow(id: string): RecurrenceRow | undefined {
    return selectById.get(id) as RecurrenceRow | undefined;
  }

  function getById(id: string): RecurrenceView {
    const row = findRow(id);
    if (!row) throw new NotFoundError('Recorrência não encontrada.');
    const rule = toRecurrence(row);
    return { ...rule, accountName: row.account_name, nextDate: nextDateOf(rule) };
  }

  /** Próximo lançamento previsto. Regras pausadas continuam mostrando o seu. */
  function nextDateOf(rule: Recurrence): string | null {
    return nextOccurrence(rule, pendingFrom(rule));
  }

  function list(): RecurrenceView[] {
    return (selectAll.all() as unknown as RecurrenceRow[]).map((row) => {
      const rule = toRecurrence(row);
      return { ...rule, accountName: row.account_name, nextDate: nextDateOf(rule) };
    });
  }

  function count(): number {
    const row = db.prepare('SELECT COUNT(*) AS total FROM recurrences').get() as { total: number };
    return row.total;
  }

  function resolveAccountId(accountId: string | null | undefined): string | null {
    if (!accountId) return null;
    if (!accountExists.get(accountId)) {
      throw new ValidationError('A conta escolhida não existe mais. Selecione outra.');
    }
    return accountId;
  }

  /**
   * Completa o calendário com o que o cliente não mandou. Uma regra mensal criada
   * sem `dayOfMonth` cai no dia da data de início, que é o que o usuário espera.
   */
  function calendarOf(input: RecurrenceInput): {
    dayOfMonth: number;
    weekday: number;
    month: number;
  } {
    return {
      dayOfMonth: input.dayOfMonth ?? Number(input.startDate.slice(8, 10)),
      weekday: input.weekday ?? weekdayOf(input.startDate),
      month: input.month ?? Number(input.startDate.slice(5, 7)),
    };
  }

  function writeArgs(input: RecurrenceInput): Array<string | number | null> {
    const calendar = calendarOf(input);
    return [
      input.type,
      input.amountCents,
      input.description,
      input.category,
      resolveAccountId(input.accountId),
      input.frequency,
      calendar.dayOfMonth,
      calendar.weekday,
      calendar.month,
      input.startDate,
      input.endDate ?? null,
      input.active === false ? 0 : 1,
    ];
  }

  function create(input: RecurrenceInput): RecurrenceView {
    if (count() >= MAX_RECURRENCES) {
      throw new AppError(
        409,
        'TOO_MANY_RECURRENCES',
        `O limite é de ${MAX_RECURRENCES} recorrências.`,
      );
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    insert.run(id, ...writeArgs(input), null, now, now);

    // Uma regra que começa no passado já nasce com os lançamentos dela em dia.
    catchUp();
    return getById(id);
  }

  function update(id: string, input: RecurrenceInput): RecurrenceView {
    getById(id); // garante 404 antes de escrever
    updateStatement.run(...writeArgs(input), new Date().toISOString(), id);
    catchUp();
    return getById(id);
  }

  /** Apagar a regra não apaga o histórico: os lançamentos gerados continuam lá. */
  function remove(id: string): void {
    const result = deleteStatement.run(id);
    if (result.changes === 0) throw new NotFoundError('Recorrência não encontrada.');
  }

  /**
   * "Ao entrar": tudo que venceu até `reference` vira transação de verdade.
   *
   * A marca d'água anda para toda regra, inclusive as pausadas — assim uma regra
   * reativada meses depois lança dali para a frente, sem inventar o passado.
   */
  function catchUp(reference: string = today()): number {
    const rules = rows();
    if (rules.length === 0) return 0;

    const pending = rules.map((rule) => ({
      rule,
      dates: rule.active ? occurrencesBetween(rule, pendingFrom(rule), reference) : [],
    }));

    const behind = pending.filter(
      ({ rule, dates }) =>
        dates.length > 0 || rule.lastRunDate === null || rule.lastRunDate < reference,
    );
    if (behind.length === 0) return 0;

    db.exec('BEGIN');
    try {
      let created = 0;
      for (const { rule, dates } of behind) {
        for (const date of dates) {
          transactions.create({
            type: rule.type,
            amountCents: rule.amountCents,
            description: rule.description,
            category: rule.category,
            date,
            accountId: rule.accountId,
            recurrenceId: rule.id,
          });
          created += 1;
        }
        markConsidered.run(reference, rule.id, reference);
      }
      db.exec('COMMIT');
      return created;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * O que as regras ativas ainda vão lançar entre duas datas, somado por dia.
   *
   * Serve só para o gráfico de barras desenhar o que vem por aí: nada disso é
   * gravado, nem entra em saldo, totais ou categorias.
   */
  function projectBetween(from: string, to: string): Map<string, PendingTotals> {
    const projection = new Map<string, PendingTotals>();
    if (from > to) return projection;

    for (const rule of rows()) {
      if (!rule.active) continue;
      const notYetLaunched = pendingFrom(rule);
      const start = notYetLaunched > from ? notYetLaunched : from;

      for (const date of occurrencesBetween(rule, start, to)) {
        const entry = projection.get(date) ?? { incomeCents: 0, expenseCents: 0 };
        if (rule.type === 'income') entry.incomeCents += rule.amountCents;
        else entry.expenseCents += rule.amountCents;
        projection.set(date, entry);
      }
    }

    return projection;
  }

  return { list, getById, create, update, remove, count, catchUp, projectBetween };
}
