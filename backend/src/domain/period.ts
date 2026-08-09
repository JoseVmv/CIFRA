import { addDays, startOfMonth, today } from './dates';
import type { DateRange, PeriodKey } from './types';

export const PERIOD_KEYS: readonly PeriodKey[] = ['7d', '30d', '90d', 'month', 'all'];

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
 * concreto de datas. Um `from`/`to` explícito sempre vence — é o que permite ao
 * frontend usar o relógio do próprio usuário.
 */
export function resolveRange({ period = '30d', from, to, now }: ResolveOptions): DateRange {
  const reference = to ?? today(now);

  if (from || to) {
    return { from: from ?? null, to: reference, period: 'custom' };
  }

  switch (period) {
    case '7d':
      return { from: addDays(reference, -6), to: reference, period };
    case '30d':
      return { from: addDays(reference, -29), to: reference, period };
    case '90d':
      return { from: addDays(reference, -89), to: reference, period };
    case 'month':
      return { from: startOfMonth(reference), to: reference, period };
    case 'all':
      return { from: null, to: reference, period };
  }
}
