import { addMonths, endOfMonth, endOfYear, startOfMonth, startOfYear, today } from './dates';
import type { DateRange, PeriodKey } from './types';

export const PERIOD_KEYS: readonly PeriodKey[] = ['month', '3m', '6m', 'year', 'all'];

export function isPeriodKey(value: string): value is PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(value);
}

/** Quantos meses cada período abrange — usado para navegar e para comparar. */
const PERIOD_MONTHS: Record<Exclude<PeriodKey, 'all'>, number> = {
  month: 1,
  '3m': 3,
  '6m': 6,
  year: 12,
};

interface ResolveOptions {
  period?: PeriodKey;
  /**
   * Data em torno da qual o período é montado (`YYYY-MM-DD`). É o que permite
   * navegar para meses anteriores sem mexer no relógio.
   */
  reference?: string;
  from?: string;
  to?: string;
  now?: Date;
}

/**
 * Converte `period` (ou um intervalo explícito `from`/`to`) num intervalo
 * concreto de datas.
 *
 * Os períodos são **meses de calendário fechados**, não janelas móveis: "Este mês"
 * vai do dia 1 ao último dia do mês, e "Últimos 3 meses" cobre três meses inteiros
 * terminando no mês da referência.
 *
 * Em "Tudo" os dois limites ficam abertos (`null`) — nada é recortado, nem
 * lançamentos antigos nem datas futuras.
 */
export function resolveRange({
  period = 'month',
  reference,
  from,
  to,
  now,
}: ResolveOptions): DateRange {
  const anchor = reference ?? to ?? today(now);

  if (from || to) {
    return { from: from ?? null, to: to ?? anchor, period: 'custom' };
  }

  switch (period) {
    case 'month':
      return { from: startOfMonth(anchor), to: endOfMonth(anchor), period };
    case '3m':
      return { from: startOfMonth(addMonths(anchor, -2)), to: endOfMonth(anchor), period };
    case '6m':
      return { from: startOfMonth(addMonths(anchor, -5)), to: endOfMonth(anchor), period };
    case 'year':
      return { from: startOfYear(anchor), to: endOfYear(anchor), period };
    case 'all':
      return { from: null, to: null, period };
  }
}

/**
 * Janela imediatamente anterior e de mesmo tamanho — a base do comparativo.
 * "Tudo" não tem anterior, então devolve `null`.
 */
export function previousRange({
  period = 'month',
  reference,
  now,
}: Pick<ResolveOptions, 'period' | 'reference' | 'now'>): DateRange | null {
  if (period === 'all') return null;

  const anchor = reference ?? today(now);
  const months = PERIOD_MONTHS[period];
  return resolveRange({ period, reference: addMonths(anchor, -months) });
}

/** Quantos meses o período avança ou recua a cada clique nas setas. */
export function periodStepInMonths(period: PeriodKey): number {
  return period === 'all' ? 0 : PERIOD_MONTHS[period];
}
