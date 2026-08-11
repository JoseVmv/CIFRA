/**
 * Em que datas uma recorrência cai.
 *
 * Funções puras: não conhecem banco nem relógio. É o mesmo cálculo usado para
 * materializar o passado (virar transação de verdade) e para projetar o futuro
 * (as barras ilustrativas do gráfico).
 */

import { addDays, addMonths, daysInMonth, startOfMonth, weekdayOf } from './dates';
import type { Recurrence } from './types';

/** Trava contra janelas absurdas — nenhuma tela precisa de mais do que isso. */
const MAX_OCCURRENCES = 600;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** O dia pedido dentro do mês da âncora, encolhido quando o mês é mais curto. */
function dayInMonthOf(anchor: string, dayOfMonth: number): string {
  return `${anchor.slice(0, 7)}-${pad(Math.min(dayOfMonth, daysInMonth(anchor)))}`;
}

/**
 * Primeira data ainda não considerada pela regra. A marca d'água (`lastRunDate`)
 * é o que garante que um lançamento apagado à mão não volte sozinho.
 */
export function pendingFrom(rule: Recurrence): string {
  if (!rule.lastRunDate) return rule.startDate;
  const afterLastRun = addDays(rule.lastRunDate, 1);
  return afterLastRun > rule.startDate ? afterLastRun : rule.startDate;
}

/**
 * Datas em que a regra cai dentro de `[from, to]`, em ordem crescente.
 * O intervalo é recortado pelo início e pelo fim da própria regra.
 */
export function occurrencesBetween(rule: Recurrence, from: string, to: string): string[] {
  const start = from > rule.startDate ? from : rule.startDate;
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (start > end) return [];

  const dates: string[] = [];

  if (rule.frequency === 'weekly') {
    // Anda até o primeiro dia da semana pedido e daí segue de 7 em 7.
    const offset = (rule.weekday - weekdayOf(start) + 7) % 7;
    for (let cursor = addDays(start, offset); cursor <= end; cursor = addDays(cursor, 7)) {
      dates.push(cursor);
      if (dates.length >= MAX_OCCURRENCES) break;
    }
    return dates;
  }

  if (rule.frequency === 'monthly') {
    // Começa no mês de `start`: a data daquele mês pode ser anterior a ele.
    for (let anchor = startOfMonth(start); anchor <= end; anchor = addMonths(anchor, 1)) {
      const date = dayInMonthOf(anchor, rule.dayOfMonth);
      if (date >= start && date <= end) dates.push(date);
      if (dates.length >= MAX_OCCURRENCES) break;
    }
    return dates;
  }

  for (let year = Number(start.slice(0, 4)); ; year += 1) {
    const anchor = `${year}-${pad(rule.month)}-01`;
    if (anchor > end) break;
    const date = dayInMonthOf(anchor, rule.dayOfMonth);
    if (date >= start && date <= end) dates.push(date);
    if (dates.length >= MAX_OCCURRENCES) break;
  }
  return dates;
}

/** Quantos anos à frente vale a pena procurar antes de desistir. */
const NEXT_DATE_HORIZON_YEARS = 5;

/** Próxima data em que a regra cai a partir de `from`; `null` se ela já acabou. */
export function nextOccurrence(rule: Recurrence, from: string): string | null {
  const horizon = `${Number(from.slice(0, 4)) + NEXT_DATE_HORIZON_YEARS}${from.slice(4)}`;
  return occurrencesBetween(rule, from, horizon)[0] ?? null;
}
