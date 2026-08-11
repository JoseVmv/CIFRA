import { describe, expect, it } from 'vitest';
import { fileNameOf, summarize, toCsv, toJson, type ExportFilters } from './export';
import type { Transaction } from '../types/api';

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'id-1',
    type: 'expense',
    amountCents: 8_000,
    description: 'Combustível',
    category: 'Transporte',
    date: '2026-08-09',
    accountId: null,
    accountName: null,
    transferAccountId: null,
    transferAccountName: null,
    recurrenceId: null,
    installmentGroup: null,
    installmentNumber: null,
    installmentTotal: null,
    createdAt: '2026-08-09T12:00:00.000Z',
    updatedAt: '2026-08-09T12:00:00.000Z',
    ...overrides,
  };
}

const FILTERS: ExportFilters = {
  periodLabel: 'Agosto 2026',
  from: '2026-08-01',
  to: '2026-08-31',
  type: '',
  category: '',
  accountName: '',
  search: '',
};

function options(transactions: Transaction[], includeTotals = false) {
  return { transactions, filters: FILTERS, includeTotals };
}

describe('exportação em CSV', () => {
  it('usa ponto e vírgula, vírgula decimal e data brasileira no dialeto do Excel', () => {
    const csv = toCsv('csv-excel', options([transaction()]));
    // A primeira linha começa com a marca de bytes, verificada em outro teste.
    const [cabecalho, linha] = csv.replace(/^﻿/, '').trimEnd().split('\r\n');

    expect(cabecalho).toBe('Data;Tipo;Descrição;Categoria;Conta;Valor;Transferido;Parcela;Origem');
    expect(linha).toBe('09/08/2026;Saída;Combustível;Transporte;;-80,00;;;Manual');
  });

  it('usa vírgula, ponto decimal e data ISO no dialeto padrão', () => {
    const csv = toCsv('csv-padrao', options([transaction()]));
    expect(csv.trimEnd().split('\r\n')[1]).toBe(
      '2026-08-09,Saída,Combustível,Transporte,,-80.00,,,Manual',
    );
  });

  it('deixa o Valor vazio na transferência, para não sujar a soma da planilha', () => {
    const csv = toCsv(
      'csv-padrao',
      options([
        transaction({
          type: 'transfer',
          amountCents: 50_000,
          description: 'Reserva',
          category: 'Transferência',
          accountName: 'Nubank',
          transferAccountName: 'Poupança',
        }),
      ]),
    );

    expect(csv.trimEnd().split('\r\n')[1]).toBe(
      '2026-08-09,Transferência,Reserva,Transferência,Nubank → Poupança,,500.00,,Manual',
    );
  });

  it('numera a parcela na coluna própria', () => {
    const csv = toCsv(
      'csv-padrao',
      options([transaction({ installmentNumber: 3, installmentTotal: 10 })]),
    );
    expect(csv).toContain(',3/10,');
  });

  it('põe a marca de bytes só no dialeto do Excel — é o que salva os acentos lá', () => {
    expect(toCsv('csv-excel', options([transaction()])).startsWith('﻿')).toBe(true);
    expect(toCsv('csv-padrao', options([transaction()])).startsWith('﻿')).toBe(false);
  });

  it('entrada é positiva e saída é negativa, para a soma da planilha bater', () => {
    const csv = toCsv('csv-padrao', options([transaction({ type: 'income', amountCents: 12_345 })]));
    expect(csv).toContain(',123.45,');
  });

  it('protege campos com separador, aspas e quebra de linha', () => {
    const csv = toCsv(
      'csv-excel',
      options([transaction({ description: 'Mercado; feira', category: 'Diz "casa"' })]),
    );
    expect(csv).toContain('"Mercado; feira"');
    expect(csv).toContain('"Diz ""casa"""');
  });

  it('escreve a conta e marca o que veio de recorrência', () => {
    const csv = toCsv(
      'csv-padrao',
      options([transaction({ accountName: 'Nubank', recurrenceId: 'regra-1' })]),
    );
    expect(csv).toContain(',Nubank,');
    expect(csv).toContain(',Recorrência');
  });

  it('acrescenta a linha de totais só quando pedida', () => {
    const lista = [
      transaction({ type: 'income', amountCents: 100_000 }),
      transaction({ id: 'id-2', amountCents: 30_000 }),
    ];

    expect(toCsv('csv-padrao', options(lista))).not.toContain('TOTAL');
    expect(toCsv('csv-padrao', options(lista, true)).trimEnd().split('\r\n').at(-1)).toBe(
      ',,TOTAL,,,700.00,,,',
    );
  });
});

describe('exportação em JSON', () => {
  it('leva filtros, resumo e as transações, com valores em centavos', () => {
    const conteudo = JSON.parse(
      toJson(
        options([
          transaction({ type: 'income', amountCents: 100_000 }),
          transaction({ id: 'id-2', amountCents: 30_000 }),
        ]),
      ),
    );

    expect(conteudo.filtros.periodo).toBe('Agosto 2026');
    expect(conteudo.resumo).toEqual({
      quantidade: 2,
      entradasCents: 100_000,
      saidasCents: 30_000,
      transferidoCents: 0,
      resultadoCents: 70_000,
    });
    expect(conteudo.transacoes).toHaveLength(2);
    expect(conteudo.transacoes[0].amountCents).toBe(100_000);
  });
});

describe('resumo e nome do arquivo', () => {
  it('soma entradas e saídas separadamente', () => {
    expect(
      summarize([
        transaction({ type: 'income', amountCents: 10 }),
        transaction({ type: 'income', amountCents: 20 }),
        transaction({ amountCents: 5 }),
      ]),
    ).toEqual({ count: 3, incomeCents: 30, expenseCents: 5, transferCents: 0, netCents: 25 });
  });

  it('mantém a transferência fora do resultado', () => {
    expect(
      summarize([
        transaction({ type: 'income', amountCents: 100 }),
        transaction({ type: 'transfer', amountCents: 5_000 }),
      ]),
    ).toEqual({
      count: 2,
      incomeCents: 100,
      expenseCents: 0,
      transferCents: 5_000,
      netCents: 100,
    });
  });

  it('conta o recorte no nome do arquivo', () => {
    expect(fileNameOf('csv-excel', FILTERS, '2026-08-11')).toBe(
      'cifra-transacoes-2026-08-01-a-2026-08-31.csv',
    );
    expect(fileNameOf('json', { ...FILTERS, from: null, to: null }, '2026-08-11')).toBe(
      'cifra-transacoes-tudo-2026-08-11.json',
    );
  });
});
