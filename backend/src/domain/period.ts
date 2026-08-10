import { addMonths, endOfMonth, endOfYear, startOfMonth, startOfYear, today } from './dates';
import type { DateRange, PeriodKey } from './types';

export const PERIOD_KEYS: readonly PeriodKey[] = ['month', '3m', '6m', 'year', 'all'];

export function isPeriodKey(value: string): value is PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(value);
}

interface ResolveOptions {
  period?: PeriodKey;
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
 * incluindo o atual. Assim a comparação entre períodos é sempre entre meses
 * equivalentes.
 *
 * Em "Tudo" os dois limites ficam abertos (`null`) — nada é recortado, nem
 * lançamentos antigos nem datas futuras.
 */
export function resolveRange({ period = 'month', from, to, now }: ResolveOptions): DateRange {
  const reference = to ?? today(now);

  if (from || to) {
    return { from: from ?? null, to: reference, period: 'custom' };
  }

  switch (period) {
    case 'month':
      return { from: startOfMonth(reference), to: endOfMonth(reference), period };
    case '3m':
      return { from: startOfMonth(addMonths(reference, -2)), to: endOfMonth(reference), period };
    case '6m':
      return { from: startOfMonth(addMonths(reference, -5)), to: endOfMonth(reference), period };
    case 'year':
      return { from: startOfYear(reference), to: endOfYear(reference), period };
    case 'all':
      return { from: null, to: null, period };
  }
}
