import type { DatabaseSync } from 'node:sqlite';
import { daysBetween, eachDay, eachMonth } from '../domain/dates';
import type {
  CategorySlice,
  DateRange,
  Granularity,
  SeriesPoint,
  Statistics,
  Summary,
  TransactionType,
} from '../domain/types';
import type { SettingsService } from './settings.service';
import type { TransactionsService } from './transactions.service';

/** Acima disso o gráfico diário viraria ruído — agrupamos por mês. */
const MAX_DAILY_BUCKETS = 92;

interface Totals {
  incomeCents: number;
  expenseCents: number;
  count: number;
}

const EMPTY_TOTALS: Totals = { incomeCents: 0, expenseCents: 0, count: 0 };

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;

export function createAnalyticsService(
  db: DatabaseSync,
  settings: SettingsService,
  transactions: TransactionsService,
) {
  const totalsAll = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense,
       COUNT(*) AS count
     FROM transactions`,
  );

  const totalsBefore = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense,
       COUNT(*) AS count
     FROM transactions
     WHERE date < ?`,
  );

  const totalsInRange = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense,
       COUNT(*) AS count
     FROM transactions
     WHERE date >= ? AND date <= ?`,
  );

  const totalsUntil = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense,
       COUNT(*) AS count
     FROM transactions
     WHERE date <= ?`,
  );

  function readTotals(
    statement: { get: (...params: Array<string | number>) => unknown },
    ...params: Array<string | number>
  ): Totals {
    const row = statement.get(...params) as
      | { income: number; expense: number; count: number }
      | undefined;
    if (!row) return EMPTY_TOTALS;
    return { incomeCents: row.income, expenseCents: row.expense, count: row.count };
  }

  function rangeTotals(range: DateRange): Totals {
    if (range.from === null) return readTotals(totalsUntil, range.to);
    return readTotals(totalsInRange, range.from, range.to);
  }

  /** Saldo imediatamente antes do início do período. */
  function openingBalance(range: DateRange): number {
    const initial = settings.getInitialBalanceCents();
    if (range.from === null) return initial;
    const before = readTotals(totalsBefore, range.from);
    return initial + before.incomeCents - before.expenseCents;
  }

  function currentBalanceCents(): number {
    const all = readTotals(totalsAll);
    return settings.getInitialBalanceCents() + all.incomeCents - all.expenseCents;
  }

  function getSummary(range: DateRange): Summary {
    const period = rangeTotals(range);
    return {
      range,
      currentBalanceCents: currentBalanceCents(),
      initialBalanceCents: settings.getInitialBalanceCents(),
      openingBalanceCents: openingBalance(range),
      incomeCents: period.incomeCents,
      expenseCents: period.expenseCents,
      netCents: period.incomeCents - period.expenseCents,
      transactionCount: period.count,
    };
  }

  function byCategory(type: TransactionType, range: DateRange): CategorySlice[] {
    const conditions = ['type = ?', 'date <= ?'];
    const params: Array<string | number> = [type, range.to];
    if (range.from !== null) {
      conditions.push('date >= ?');
      params.push(range.from);
    }

    const rows = db
      .prepare(
        `SELECT category, SUM(amount_cents) AS total, COUNT(*) AS count
           FROM transactions
          WHERE ${conditions.join(' AND ')}
          GROUP BY category
          ORDER BY total DESC, category ASC`,
      )
      .all(...params) as Array<{ category: string; total: number; count: number }>;

    const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

    return rows.map((row) => ({
      category: row.category,
      totalCents: row.total,
      percent: grandTotal > 0 ? Math.round((row.total / grandTotal) * 1000) / 10 : 0,
      count: row.count,
    }));
  }

  function buildSeries(
    from: string,
    to: string,
    granularity: Granularity,
    startingBalance: number,
  ): SeriesPoint[] {
    const bucketExpression = granularity === 'day' ? 'date' : "substr(date, 1, 7)";
    const rows = db
      .prepare(
        `SELECT ${bucketExpression} AS bucket,
                COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense
           FROM transactions
          WHERE date >= ? AND date <= ?
          GROUP BY bucket
          ORDER BY bucket ASC`,
      )
      .all(from, to) as Array<{ bucket: string; income: number; expense: number }>;

    const byBucket = new Map(rows.map((row) => [row.bucket, row]));
    const buckets = granularity === 'day' ? eachDay(from, to) : eachMonth(from, to);

    let runningBalance = startingBalance;
    return buckets.map((bucket) => {
      const entry = byBucket.get(bucket);
      const incomeCents = entry?.income ?? 0;
      const expenseCents = entry?.expense ?? 0;
      runningBalance += incomeCents - expenseCents;
      return { bucket, incomeCents, expenseCents, balanceCents: runningBalance };
    });
  }

  function getStatistics(range: DateRange): Statistics {
    const totals = rangeTotals(range);
    const opening = openingBalance(range);

    // "Tudo" precisa de um início concreto para desenhar a série.
    const from = range.from ?? transactions.earliestDate() ?? range.to;
    const start = from > range.to ? range.to : from;
    const granularity: Granularity =
      daysBetween(start, range.to) + 1 > MAX_DAILY_BUCKETS ? 'month' : 'day';

    return {
      range: { ...range, granularity },
      totals: {
        incomeCents: totals.incomeCents,
        expenseCents: totals.expenseCents,
        netCents: totals.incomeCents - totals.expenseCents,
      },
      openingBalanceCents: opening,
      series: buildSeries(start, range.to, granularity, opening),
      expensesByCategory: byCategory('expense', range),
      incomeByCategory: byCategory('income', range),
    };
  }

  return { getSummary, getStatistics, currentBalanceCents };
}
