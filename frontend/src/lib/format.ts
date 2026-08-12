/**
 * Formatação de dinheiro e datas.
 *
 * Locale e moeda são estado de módulo, ajustados por `I18nProvider` antes de
 * cada render. A alternativa — passar os dois em cada uma das dezenas de
 * chamadas — não pagaria: estas funções são chamadas de dentro do JSX o tempo
 * todo, e o app tem um idioma e uma moeda só por vez.
 *
 * Idioma e moeda são independentes de propósito: dá para ler o app em inglês
 * com valores em real, ou em português com valores em dólar.
 */

import type { Currency } from '../types/api';

let locale = 'pt-BR';
let currency: Currency = 'BRL';

interface Formatters {
  currency: Intl.NumberFormat;
  compact: Intl.NumberFormat;
  decimal: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  dayMonth: Intl.DateTimeFormat;
  fullDate: Intl.DateTimeFormat;
  monthYear: Intl.DateTimeFormat;
  monthLong: Intl.DateTimeFormat;
  monthShort: Intl.DateTimeFormat;
  /** "R$", "US$", "$" — o que o par idioma+moeda produz. */
  symbol: string;
}

/**
 * Montar `Intl` custa caro; uma combinação só está em uso por vez, então cabe
 * cache. A chave é o par, porque o símbolo depende dos dois: dólar em português
 * é "US$", em inglês é "$".
 */
const cache = new Map<string, Formatters>();

function build(target: string, money: Currency): Formatters {
  const currencyFormat = new Intl.NumberFormat(target, { style: 'currency', currency: money });

  return {
    currency: currencyFormat,
    compact: new Intl.NumberFormat(target, { notation: 'compact', maximumFractionDigits: 1 }),
    decimal: new Intl.NumberFormat(target, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    percent: new Intl.NumberFormat(target, { maximumFractionDigits: 1 }),
    dayMonth: new Intl.DateTimeFormat(target, { day: '2-digit', month: 'short' }),
    fullDate: new Intl.DateTimeFormat(target, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    monthYear: new Intl.DateTimeFormat(target, { month: 'short', year: '2-digit' }),
    monthLong: new Intl.DateTimeFormat(target, { month: 'long' }),
    monthShort: new Intl.DateTimeFormat(target, { month: 'short' }),
    // Perguntar ao próprio `Intl` evita manter uma tabela de símbolos à mão.
    symbol:
      currencyFormat.formatToParts(0).find((part) => part.type === 'currency')?.value ?? money,
  };
}

function formatters(): Formatters {
  const key = `${locale}:${currency}`;
  let found = cache.get(key);
  if (!found) {
    found = build(locale, currency);
    cache.set(key, found);
  }
  return found;
}

/** Chamado só pelo `I18nProvider`. */
export function setFormatting(nextLocale: string, nextCurrency: Currency): void {
  locale = nextLocale;
  currency = nextCurrency;
}

export function formattingLocale(): string {
  return locale;
}

/** Símbolo da moeda em uso — para prefixar campos de digitação. */
export function currencySymbol(): string {
  return formatters().symbol;
}

/** R$ 1.234,56 — ou US$ 1.234,56, ou $1,234.56, conforme moeda e idioma. */
export function formatCurrency(cents: number): string {
  return formatters().currency.format(cents / 100);
}

/** Igual ao anterior, mas com sinal explícito — usado no histórico. */
export function formatSigned(cents: number, type: 'income' | 'expense'): string {
  const sign = type === 'income' ? '+' : '−';
  return `${sign} ${formatters().currency.format(Math.abs(cents) / 100)}`;
}

/** 1,2 mil — para eixos de gráfico, onde espaço é escasso. */
export function formatCompactCurrency(cents: number): string {
  const { symbol, compact } = formatters();
  const value = cents / 100;
  if (Math.abs(value) >= 1000) return `${symbol} ${compact.format(value)}`;
  return `${symbol} ${Math.round(value)}`;
}

/** 1.234,56 — sem símbolo, para campos de formulário. */
export function formatDecimal(cents: number): string {
  return formatters().decimal.format(cents / 100);
}

/** Percentuais com no máximo uma casa, no separador do idioma. */
export function formatPercent(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
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

/** Converte `YYYY-MM-DD` num Date local, sem escorregar de fuso. */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** "09 ago" */
export function formatDayMonth(iso: string): string {
  return formatters().dayMonth.format(parseIsoDate(iso)).replace('.', '');
}

/** "09 de agosto de 2026" */
export function formatFullDate(iso: string): string {
  return formatters().fullDate.format(parseIsoDate(iso));
}

/** "ago/26" — usado quando o gráfico agrupa por mês. */
export function formatMonth(bucket: string): string {
  return formatters().monthYear.format(parseIsoDate(`${bucket}-01`)).replace('.', '');
}

/** Rótulo de um ponto da série, seja ele diário ou mensal. */
export function formatBucket(bucket: string): string {
  return bucket.length === 7 ? formatMonth(bucket) : formatDayMonth(bucket);
}

/** Nome do mês de uma data ISO, para os rótulos de período. */
export function formatMonthName(iso: string, style: 'long' | 'short'): string {
  const format = style === 'long' ? formatters().monthLong : formatters().monthShort;
  const name = format.format(parseIsoDate(iso)).replace('.', '');
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** Date → `YYYY-MM-DD` no fuso local. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const todayIso = (): string => toIsoDate(new Date());

/**
 * "Hoje", "Ontem" ou a data por extenso — cabeçalho dos grupos do histórico.
 * Os dois primeiros rótulos vêm do dicionário, que quem chama já tem em mãos.
 */
export function formatRelativeDay(iso: string, labels: { today: string; yesterday: string }): string {
  const today = toIsoDate(new Date());
  if (iso === today) return labels.today;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === toIsoDate(yesterday)) return labels.yesterday;

  return formatFullDate(iso);
}
