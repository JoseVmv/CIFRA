import { formatMonthName, todayIso } from './format';
import type { PeriodKey } from '../types/api';

/**
 * Aritmética de meses no formato `YYYY-MM-DD`, espelhando a do backend.
 *
 * O servidor continua sendo a fonte da verdade dos dados; isto existe só para a
 * interface saber que rótulo mostrar e para onde as setas levam, sem esperar
 * uma resposta da API a cada clique.
 */

function toUtc(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const date = toUtc(iso);
  const targetDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  date.setUTCDate(Math.min(targetDay, lastDay));
  return format(date);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  return format(new Date(Date.UTC(year, month, 0, 12)));
}

/** Quantos meses o período abrange — também é o passo das setas. */
const PERIOD_MONTHS: Record<Exclude<PeriodKey, 'all'>, number> = {
  month: 1,
  '3m': 3,
  '6m': 6,
  year: 12,
};

export function periodStep(period: PeriodKey): number {
  return period === 'all' ? 0 : PERIOD_MONTHS[period];
}

export interface Window {
  from: string;
  to: string;
}

/** Janela que o backend vai calcular para este período e esta referência. */
export function periodWindow(period: PeriodKey, anchor: string): Window | null {
  if (period === 'all') return null;
  if (period === 'year') {
    const year = anchor.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return {
    from: startOfMonth(addMonths(anchor, -(PERIOD_MONTHS[period] - 1))),
    to: endOfMonth(anchor),
  };
}

/** A janela já alcança hoje? Se sim, não há para onde avançar. */
export function isCurrentWindow(period: PeriodKey, anchor: string): boolean {
  const window = periodWindow(period, anchor);
  return window === null || window.to >= todayIso();
}

/**
 * "Agosto 2026", "Jun – Ago 2026", "2026" — o nome do mês segue o idioma.
 *
 * O rótulo de "Todo o período" não sai daqui: ele é texto puro do dicionário e
 * fica com quem chama, para esta função continuar sendo só aritmética de datas.
 */
export function periodWindowLabel(period: PeriodKey, anchor: string): string {
  if (period === 'all') return '';
  if (period === 'year') return anchor.slice(0, 4);

  const window = periodWindow(period, anchor);
  if (!window) return '';

  const endYear = window.to.slice(0, 4);
  if (period === 'month') return `${formatMonthName(window.from, 'long')} ${endYear}`;

  const startYear = window.from.slice(0, 4);
  const start = formatMonthName(window.from, 'short');
  const end = formatMonthName(window.to, 'short');

  return startYear === endYear
    ? `${start} – ${end} ${endYear}`
    : `${start} ${startYear} – ${end} ${endYear}`;
}
