/**
 * Utilidades de data em formato `YYYY-MM-DD`.
 *
 * As transações são registradas por data de calendário (não por instante), então
 * todas as contas aqui são feitas em UTC ao meio-dia para nunca escorregar um dia
 * por causa de fuso horário ou horário de verão.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function toUtcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Data de hoje no fuso local da máquina. */
export function today(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

export function addMonths(iso: string, months: number): string {
  const date = toUtcDate(iso);
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

/** Último dia do mês: 28, 29, 30 ou 31, conforme o calendário. */
export function endOfMonth(iso: string): string {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  // Dia 0 do mês seguinte é o último dia do mês atual.
  return format(new Date(Date.UTC(year, month, 0, 12)));
}

/** Quantos dias tem o mês desta data: 28, 29, 30 ou 31. */
export function daysInMonth(iso: string): number {
  return Number(endOfMonth(iso).slice(8));
}

/** Dia da semana: 0 = domingo … 6 = sábado. */
export function weekdayOf(iso: string): number {
  return toUtcDate(iso).getUTCDay();
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function endOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-12-31`;
}

/** Diferença em dias inteiros entre duas datas (`to - from`). */
export function daysBetween(from: string, to: string): number {
  const diff = toUtcDate(to).getTime() - toUtcDate(from).getTime();
  return Math.round(diff / 86_400_000);
}

/** Lista de datas `YYYY-MM-DD`, inclusiva nas duas pontas. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    days.push(cursor);
    if (days.length > 10_000) break; // trava de segurança contra intervalos absurdos
  }
  return days;
}

/** Lista de meses `YYYY-MM`, inclusiva nas duas pontas. */
export function eachMonth(from: string, to: string): string[] {
  const months: string[] = [];
  const last = to.slice(0, 7);
  for (let cursor = startOfMonth(from); cursor.slice(0, 7) <= last; cursor = addMonths(cursor, 1)) {
    months.push(cursor.slice(0, 7));
    if (months.length > 1_200) break;
  }
  return months;
}
