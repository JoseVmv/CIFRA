/**
 * Geração dos arquivos de exportação.
 *
 * Tudo aqui é função pura sobre a lista de transações: nada busca dados nem
 * toca no DOM, com exceção declarada de `downloadFile` e `printDocument`, que
 * são a entrega em si.
 */

import { categoryLabel } from '../i18n/categories';
import type { Language } from '../i18n';
import type { Dictionary } from '../i18n/pt';
import { formatCurrency, formatFullDate } from './format';
import type { Currency, Transaction, TransactionType } from '../types/api';

export type ExportFormat = 'csv-excel' | 'csv-padrao' | 'json' | 'pdf';

export function formatOptions(
  t: Dictionary,
): ReadonlyArray<{ value: ExportFormat; label: string; hint: string }> {
  return [
    { value: 'csv-excel', label: t.exportDialog.csvExcel, hint: t.exportDialog.csvExcelHint },
    { value: 'csv-padrao', label: t.exportDialog.csvStandard, hint: t.exportDialog.csvStandardHint },
    { value: 'json', label: t.exportDialog.json, hint: t.exportDialog.jsonHint },
    { value: 'pdf', label: t.exportDialog.pdf, hint: t.exportDialog.pdfHint },
  ];
}

/** O recorte escolhido, do jeito que ele é descrito no cabeçalho do arquivo. */
export interface ExportFilters {
  periodLabel: string;
  from: string | null;
  to: string | null;
  type: TransactionType | '';
  category: string;
  accountName: string;
  search: string;
}

export interface ExportSummary {
  count: number;
  incomeCents: number;
  expenseCents: number;
  /** Quanto andou entre contas — fora do resultado, de propósito. */
  transferCents: number;
  netCents: number;
}

export interface ExportOptions {
  transactions: Transaction[];
  filters: ExportFilters;
  /** Só vale para os CSV: acrescenta uma última linha com os totais. */
  includeTotals: boolean;
  /** O arquivo sai no idioma da interface — cabeçalhos, tipos e categorias. */
  t: Dictionary;
  language: Language;
  /** Só para registrar a unidade no rodapé; os números já vêm formatados. */
  currency: Currency;
}

/**
 * Totais do recorte. Transferências ficam de fora das somas — elas não são
 * receita nem despesa — mas continuam contadas como linhas do extrato.
 */
export function summarize(transactions: Transaction[]): ExportSummary {
  let incomeCents = 0;
  let expenseCents = 0;
  let transferCents = 0;

  for (const transaction of transactions) {
    if (transaction.type === 'income') incomeCents += transaction.amountCents;
    else if (transaction.type === 'expense') expenseCents += transaction.amountCents;
    else transferCents += transaction.amountCents;
  }

  return {
    count: transactions.length,
    incomeCents,
    expenseCents,
    transferCents,
    netCents: incomeCents - expenseCents,
  };
}

/**
 * Centavos inteiros → "1234.56", sem passar por ponto flutuante.
 * O sinal vem do tipo: saída é negativa, para `=SOMA()` dar o resultado direto.
 */
function centsToPlain(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

function signedCents(transaction: Transaction): number {
  return transaction.type === 'income' ? transaction.amountCents : -transaction.amountCents;
}

/** `2026-08-10` → `10/08/2026`, sem passar por Date (nada de fuso no caminho). */
function toBrDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

interface CsvDialect {
  separator: string;
  /** O Excel em português só entende vírgula decimal e data DD/MM/AAAA. */
  decimalComma: boolean;
  brDate: boolean;
  /** A marca de ordem de bytes é o que faz o Excel abrir os acentos certos. */
  bom: boolean;
}

const DIALECTS: Record<'csv-excel' | 'csv-padrao', CsvDialect> = {
  'csv-excel': { separator: ';', decimalComma: true, brDate: true, bom: true },
  'csv-padrao': { separator: ',', decimalComma: false, brDate: false, bom: false },
};

/**
 * `Valor` fica vazio nas transferências e o montante vai para `Transferido`.
 * É o que mantém a promessa da coluna: somá-la dá o resultado do período, sem
 * que um dinheiro que só mudou de conta entre na conta duas vezes.
 */
function csvHeader(t: Dictionary): string[] {
  const f = t.exportFile;
  return [
    f.columnDate,
    f.columnType,
    f.columnDescription,
    f.columnCategory,
    f.columnAccount,
    f.columnAmount,
    f.columnTransferred,
    f.columnInstallment,
    f.columnOrigin,
  ];
}

function typeLabel(type: Transaction['type'], t: Dictionary): string {
  if (type === 'income') return t.type.income;
  if (type === 'expense') return t.type.expense;
  return t.type.transfer;
}

/** Campos com separador, aspas ou quebra de linha viram texto entre aspas. */
function escapeCsv(value: string, separator: string): string {
  const needsQuotes =
    value.includes(separator) || value.includes('"') || value.includes('\n') || value.includes('\r');
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function toCsv(format: 'csv-excel' | 'csv-padrao', options: ExportOptions): string {
  const dialect = DIALECTS[format];
  const { separator } = dialect;

  const amountOf = (cents: number): string => {
    const plain = centsToPlain(cents);
    return dialect.decimalComma ? plain.replace('.', ',') : plain;
  };

  const { t, language } = options;

  const rows = options.transactions.map((transaction) => {
    const transfer = transaction.type === 'transfer';
    return [
      dialect.brDate ? toBrDate(transaction.date) : transaction.date,
      typeLabel(transaction.type, t),
      transaction.description,
      categoryLabel(transaction.category, language),
      transfer
        ? `${transaction.accountName ?? '?'} → ${transaction.transferAccountName ?? '?'}`
        : (transaction.accountName ?? ''),
      transfer ? '' : amountOf(signedCents(transaction)),
      transfer ? amountOf(transaction.amountCents) : '',
      transaction.installmentTotal
        ? `${transaction.installmentNumber}/${transaction.installmentTotal}`
        : '',
      transaction.recurrenceId ? t.exportFile.originRecurrence : t.exportFile.originManual,
    ];
  });

  if (options.includeTotals) {
    const summary = summarize(options.transactions);
    rows.push([
      '',
      '',
      t.exportFile.total,
      '',
      '',
      amountOf(summary.netCents),
      summary.transferCents > 0 ? amountOf(summary.transferCents) : '',
      '',
      '',
    ]);
  }

  const lines = [csvHeader(t), ...rows].map((row) =>
    row.map((field) => escapeCsv(field, separator)).join(separator),
  );

  // CRLF é o que o Excel espera; a BOM só entra no dialeto dele.
  return `${dialect.bom ? '﻿' : ''}${lines.join('\r\n')}\r\n`;
}

export function toJson(options: ExportOptions): string {
  const summary = summarize(options.transactions);

  return `${JSON.stringify(
    {
      aplicativo: 'CIFRA',
      geradoEm: new Date().toISOString(),
      moeda: options.currency,
      observacao: 'Todos os valores estão em centavos inteiros.',
      filtros: {
        periodo: options.filters.periodLabel,
        de: options.filters.from,
        ate: options.filters.to,
        tipo: options.filters.type || 'todos',
        categoria: options.filters.category || 'todas',
        conta: options.filters.accountName || 'todas',
        busca: options.filters.search || null,
      },
      resumo: {
        quantidade: summary.count,
        entradasCents: summary.incomeCents,
        saidasCents: summary.expenseCents,
        /** Fora do resultado: transferência só muda o dinheiro de conta. */
        transferidoCents: summary.transferCents,
        resultadoCents: summary.netCents,
      },
      transacoes: options.transactions,
    },
    null,
    2,
  )}\n`;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** As linhas de filtro que valem a pena aparecer no cabeçalho do extrato. */
function describeFilters(filters: ExportFilters, t: Dictionary, language: Language): string[] {
  const f = t.exportFile;
  const parts = [filters.periodLabel];
  if (filters.type) parts.push(filters.type === 'income' ? f.onlyIncome : f.onlyExpense);
  if (filters.category) parts.push(f.filterCategory(categoryLabel(filters.category, language)));
  if (filters.accountName) parts.push(f.filterAccount(filters.accountName));
  if (filters.search) parts.push(f.filterSearch(filters.search));
  return parts;
}

/**
 * Documento de uma página só (que quebra sozinho quando precisa), pensado para
 * virar PDF pela própria janela de impressão do navegador.
 */
export function toPrintableHtml(options: ExportOptions): string {
  const { t, language } = options;
  const summary = summarize(options.transactions);
  const geradoEm = formatFullDate(new Date().toISOString().slice(0, 10));

  const rows = options.transactions
    .map((transaction) => {
      const transfer = transaction.type === 'transfer';
      const income = transaction.type === 'income';

      const detalhe = transfer
        ? `${escapeHtml(transaction.accountName ?? '—')} → ${escapeHtml(
            transaction.transferAccountName ?? '—',
          )}`
        : `${escapeHtml(categoryLabel(transaction.category, language))}${
            transaction.accountName ? ` · ${escapeHtml(transaction.accountName)}` : ''
          }`;

      const parcela = transaction.installmentTotal
        ? ` <span class="fraco">${transaction.installmentNumber}/${transaction.installmentTotal}</span>`
        : '';

      const classe = transfer ? 'transferencia' : income ? 'entrada' : 'saida';
      const sinal = transfer ? '' : income ? '+ ' : '− ';

      return `<tr>
        <td class="data">${toBrDate(transaction.date)}</td>
        <td>${escapeHtml(transaction.description)}${parcela}</td>
        <td class="fraco">${detalhe}</td>
        <td class="valor ${classe}">${sinal}${formatCurrency(transaction.amountCents)}</td>
      </tr>`;
    })
    .join('\n');

  const transferido =
    summary.transferCents > 0
      ? `<div><dt>${escapeHtml(t.exportFile.columnTransferred)}</dt><dd class="transferencia">${formatCurrency(
          summary.transferCents,
        )}</dd></div>`
      : '';

  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<title>CIFRA — ${escapeHtml(t.exportFile.statementTitle)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #14141a; background: #fff;
    font: 12px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header { border-bottom: 2px solid #14141a; padding-bottom: 10px; margin-bottom: 16px; }
  .marca { font-size: 15px; font-weight: 700; letter-spacing: .08em; color: #12a150; }
  h1 { font-size: 19px; margin: 6px 0 2px; }
  .fraco { color: #6b6a66; }
  .resumo { display: flex; gap: 28px; margin: 0 0 18px; padding: 0; list-style: none; }
  .resumo dt { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #6b6a66; }
  .resumo dd { margin: 2px 0 0; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em;
       color: #6b6a66; border-bottom: 1px solid #d9d8d4; padding: 0 8px 6px 0; }
  td { padding: 6px 8px 6px 0; border-bottom: 1px solid #eeedea; vertical-align: top; }
  tr { break-inside: avoid; }
  .data, .valor { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .valor { text-align: right; padding-right: 0; font-weight: 600; }
  .entrada { color: #0f7a3f; }
  .saida { color: #a32e2a; }
  .transferencia { color: #565552; }
  th:last-child { text-align: right; padding-right: 0; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #d9d8d4;
           font-size: 10.5px; color: #6b6a66; }
</style>
</head>
<body>
  <header>
    <div class="marca">CIFRA</div>
    <h1>${escapeHtml(t.exportFile.statementTitle)}</h1>
    <p class="fraco" style="margin:0">${escapeHtml(
      describeFilters(options.filters, t, language).join(' · '),
    )}</p>
  </header>

  <dl class="resumo">
    <div><dt>${escapeHtml(t.type.incomePlural)}</dt><dd class="entrada">${formatCurrency(summary.incomeCents)}</dd></div>
    <div><dt>${escapeHtml(t.type.expensePlural)}</dt><dd class="saida">${formatCurrency(summary.expenseCents)}</dd></div>
    <div><dt>${escapeHtml(t.charts.result)}</dt><dd>${formatCurrency(summary.netCents)}</dd></div>
    ${transferido}
    <div><dt>${escapeHtml(t.exportFile.count)}</dt><dd>${summary.count}</dd></div>
  </dl>

  <table>
    <thead>
      <tr><th>${escapeHtml(t.exportFile.columnDate)}</th><th>${escapeHtml(
        t.exportFile.columnDescription,
      )}</th><th>${escapeHtml(t.exportFile.columnCategory)}</th><th>${escapeHtml(
        t.exportFile.columnAmount,
      )}</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <footer>${escapeHtml(t.exportFile.footer(geradoEm, options.currency))}</footer>
</body>
</html>`;
}

const EXTENSIONS: Record<ExportFormat, string> = {
  'csv-excel': 'csv',
  'csv-padrao': 'csv',
  json: 'json',
  pdf: 'html',
};

const MIME_TYPES: Record<ExportFormat, string> = {
  'csv-excel': 'text/csv;charset=utf-8',
  'csv-padrao': 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  pdf: 'text/html;charset=utf-8',
};

export function mimeTypeOf(format: ExportFormat): string {
  return MIME_TYPES[format];
}

/** `cifra-transacoes-2026-06-01-a-2026-08-31.csv` — o nome já conta o recorte. */
export function fileNameOf(format: ExportFormat, filters: ExportFilters, hoje: string): string {
  const range = filters.from && filters.to ? `${filters.from}-a-${filters.to}` : `tudo-${hoje}`;
  return `cifra-transacoes-${range}.${EXTENSIONS[format]}`;
}

export function buildExport(format: ExportFormat, options: ExportOptions): string {
  if (format === 'json') return toJson(options);
  if (format === 'pdf') return toPrintableHtml(options);
  return toCsv(format, options);
}

/** Entrega o arquivo pronto ao navegador. */
export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // O endereço só pode ser liberado depois que o download começa.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Abre a janela de impressão com o extrato.
 *
 * Um iframe escondido, e não uma janela nova: bloqueador de pop-up não interfere
 * e o usuário não perde a aba do app de vista.
 */
export function printDocument(html: string): void {
  const frame = document.createElement('iframe');
  frame.title = 'Extrato para impressão';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc || !view) {
    frame.remove();
    throw new Error('Não foi possível abrir a janela de impressão.');
  }

  const cleanUp = (): void => frame.remove();
  view.addEventListener('afterprint', cleanUp);

  doc.open();
  doc.write(html);
  doc.close();

  // Deixa o layout assentar antes de chamar a impressão.
  view.setTimeout(() => {
    view.focus();
    view.print();
    // Rede de segurança para navegadores que não emitem `afterprint`.
    view.setTimeout(cleanUp, 60_000);
  }, 150);
}
