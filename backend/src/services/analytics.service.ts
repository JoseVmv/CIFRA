import type { DatabaseSync } from 'node:sqlite';
import { daysBetween, eachDay, eachMonth, today } from '../domain/dates';
import type {
  CategorySlice,
  Comparison,
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

const SUM_COLUMNS = `
  COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income,
  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense,
  COUNT(*) AS count`;

interface SqlFragment {
  sql: string;
  params: string[];
}

/**
 * Cláusula de data do intervalo. Cada limite é opcional: em "Tudo" os dois são
 * `null` e a consulta simplesmente não filtra por data.
 */
function rangeClause(range: DateRange, extraConditions: string[] = []): SqlFragment {
  const conditions = [...extraConditions];
  const params: string[] = [];

  if (range.from !== null) {
    conditions.push('date >= ?');
    params.push(range.from);
  }
  if (range.to !== null) {
    conditions.push('date <= ?');
    params.push(range.to);
  }

  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;

export function createAnalyticsService(
  db: DatabaseSync,
  settings: SettingsService,
  transactions: TransactionsService,
) {
  function readTotals(where: SqlFragment, extraParams: string[] = []): Totals {
    const row = db
      .prepare(`SELECT ${SUM_COLUMNS} FROM transactions ${where.sql}`)
      .get(...extraParams, ...where.params) as
      | { income: number; expense: number; count: number }
      | undefined;

    if (!row) return { incomeCents: 0, expenseCents: 0, count: 0 };
    return { incomeCents: row.income, expenseCents: row.expense, count: row.count };
  }

  function rangeTotals(range: DateRange): Totals {
    return readTotals(rangeClause(range));
  }

  /** Saldo imediatamente antes do início do período. */
  function openingBalance(range: DateRange): number {
    const initial = settings.getInitialBalanceCents();
    if (range.from === null) return initial;
    const before = readTotals({ sql: 'WHERE date < ?', params: [range.from] });
    return initial + before.incomeCents - before.expenseCents;
  }

  function currentBalanceCents(): number {
    const all = readTotals({ sql: '', params: [] });
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
    const where = rangeClause(range, ['type = ?']);
    const rows = db
      .prepare(
        `SELECT category, SUM(amount_cents) AS total, COUNT(*) AS count
           FROM transactions
           ${where.sql}
          GROUP BY category
          ORDER BY total DESC, category ASC`,
      )
      .all(type, ...where.params) as Array<{ category: string; total: number; count: number }>;

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
    const bucketExpression = granularity === 'day' ? 'date' : 'substr(date, 1, 7)';
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

  /**
   * "Tudo" não tem limites definidos, então a série é desenhada da transação mais
   * antiga até a mais recente (sempre incluindo hoje, para a linha de saldo
   * chegar ao presente).
   */
  function seriesBounds(range: DateRange): { start: string; end: string } {
    const now = today();
    const start = range.from ?? transactions.earliestDate() ?? now;
    const latest = transactions.latestDate() ?? now;
    const end = range.to ?? (latest > now ? latest : now);
    return { start: start > end ? end : start, end };
  }

  /** Variação percentual; `null` quando não há base de comparação. */
  function changePercent(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  function buildComparison(current: Totals, previousRange: DateRange | null): Comparison | null {
    if (!previousRange) return null;

    const previous = rangeTotals(previousRange);
    return {
      range: previousRange,
      totals: {
        incomeCents: previous.incomeCents,
        expenseCents: previous.expenseCents,
        netCents: previous.incomeCents - previous.expenseCents,
      },
      incomeChangePercent: changePercent(current.incomeCents, previous.incomeCents),
      expenseChangePercent: changePercent(current.expenseCents, previous.expenseCents),
    };
  }

  function getStatistics(range: DateRange, previousRange: DateRange | null = null): Statistics {
    const totals = rangeTotals(range);
    const opening = openingBalance(range);
    const { start, end } = seriesBounds(range);
    const granularity: Granularity =
      daysBetween(start, end) + 1 > MAX_DAILY_BUCKETS ? 'month' : 'day';

    return {
      range: { ...range, granularity },
      totals: {
        incomeCents: totals.incomeCents,
        expenseCents: totals.expenseCents,
        netCents: totals.incomeCents - totals.expenseCents,
      },
      comparison: buildComparison(totals, previousRange),
      openingBalanceCents: opening,
      series: buildSeries(start, end, granularity, opening),
      expensesByCategory: byCategory('expense', range),
      incomeByCategory: byCategory('income', range),
    };
  }

  return { getSummary, getStatistics, currentBalanceCents };
}
