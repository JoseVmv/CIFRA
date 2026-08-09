const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const decimalFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** R$ 1.234,56 */
export function formatCurrency(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/** Igual ao anterior, mas com sinal explícito — usado no histórico. */
export function formatSigned(cents: number, type: 'income' | 'expense'): string {
  const sign = type === 'income' ? '+' : '−';
  return `${sign} ${currencyFormatter.format(Math.abs(cents) / 100)}`;
}

/** 1,2 mil — para eixos de gráfico, onde espaço é escasso. */
export function formatCompactCurrency(cents: number): string {
  const value = cents / 100;
  if (Math.abs(value) >= 1000) return `R$ ${compactFormatter.format(value)}`;
  return `R$ ${Math.round(value)}`;
}

/** 1.234,56 — sem símbolo, para campos de formulário. */
export function formatDecimal(cents: number): string {
  return decimalFormatter.format(cents / 100);
}

/**
 * Converte o que o usuário digita em centavos inteiros.
 * A entrada é tratada como uma sequência de dígitos: "1250" → R$ 12,50.
 */
export function digitsToCents(digits: string): number {
  const onlyDigits = digits.replace(/\D/g, '').slice(0, 15);
  return onlyDigits ? Number.parseInt(onlyDigits, 10) : 0;
}

export function centsToDigits(cents: number): string {
  return cents > 0 ? String(Math.round(cents)) : '';
}

const dayMonthFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });

/** Converte `YYYY-MM-DD` num Date local, sem escorregar de fuso. */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** "09 ago" */
export function formatDayMonth(iso: string): string {
  return dayMonthFormatter.format(parseIsoDate(iso)).replace('.', '');
}

/** "09 de agosto de 2026" */
export function formatFullDate(iso: string): string {
  return fullDateFormatter.format(parseIsoDate(iso));
}

/** "ago/26" — usado quando o gráfico agrupa por mês. */
export function formatMonth(bucket: string): string {
  return monthYearFormatter.format(parseIsoDate(`${bucket}-01`)).replace('.', '');
}

/** Rótulo de um ponto da série, seja ele diário ou mensal. */
export function formatBucket(bucket: string): string {
  return bucket.length === 7 ? formatMonth(bucket) : formatDayMonth(bucket);
}

/** "Hoje", "Ontem" ou a data por extenso — cabeçalho dos grupos do histórico. */
export function formatRelativeDay(iso: string): string {
  const today = toIsoDate(new Date());
  if (iso === today) return 'Hoje';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === toIsoDate(yesterday)) return 'Ontem';

  return formatFullDate(iso);
}

/** Date → `YYYY-MM-DD` no fuso local. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const todayIso = (): string => toIsoDate(new Date());
