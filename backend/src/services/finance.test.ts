import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection';
import {
  addDays,
  addMonths,
  daysBetween,
  eachDay,
  endOfMonth,
  isValidIsoDate,
  startOfMonth,
  today,
} from '../domain/dates';
import { previousRange, resolveRange } from '../domain/period';
import { nextOccurrence, occurrencesBetween, pendingFrom } from '../domain/recurrence';
import type { Recurrence } from '../domain/types';
import { createServices, type Services } from '.';
import { transactionBodySchema } from '../http/validation';

function setup(): Services {
  return createServices(openDatabase(':memory:'));
}

const TODAY = today();

describe('cálculo de saldo', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
  });

  it('começa zerado quando não há saldo inicial nem transações', () => {
    expect(services.analytics.currentBalanceCents()).toBe(0);
  });

  it('usa o saldo inicial como ponto de partida', () => {
    services.settings.update({ initialBalanceCents: 1_000_000 });
    expect(services.analytics.currentBalanceCents()).toBe(1_000_000);
  });

  it('aplica saldo inicial + entradas − saídas', () => {
    services.settings.update({ initialBalanceCents: 1_000_000 }); // R$ 10.000,00
    services.transactions.create({
      type: 'income',
      amountCents: 240_000,
      description: 'Salário',
      category: 'Salário',
      date: TODAY,
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 12_000,
      description: 'Combustível',
      category: 'Transporte',
      date: TODAY,
    });

    // 1.000.000 + 240.000 − 12.000
    expect(services.analytics.currentBalanceCents()).toBe(1_228_000);
  });

  it('mantém o histórico intacto ao alterar o saldo inicial', () => {
    services.settings.update({ initialBalanceCents: 100_000 });
    services.transactions.create({
      type: 'expense',
      amountCents: 30_000,
      description: 'Mercado',
      category: 'Alimentação',
      date: TODAY,
    });
    expect(services.analytics.currentBalanceCents()).toBe(70_000);

    services.settings.update({ initialBalanceCents: 500_000 });

    expect(services.transactions.count()).toBe(1);
    expect(services.analytics.currentBalanceCents()).toBe(470_000);
  });

  it('não perde precisão somando valores quebrados', () => {
    // 0,10 + 0,20 em centavos precisa dar exatamente 0,30.
    services.transactions.create({
      type: 'income',
      amountCents: 10,
      description: 'a',
      category: 'Outros',
      date: TODAY,
    });
    services.transactions.create({
      type: 'income',
      amountCents: 20,
      description: 'b',
      category: 'Outros',
      date: TODAY,
    });
    expect(services.analytics.currentBalanceCents()).toBe(30);
  });
});

describe('transações', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
  });

  it('cria uma entrada com id, timestamps e valores íntegros', () => {
    const created = services.transactions.create({
      type: 'income',
      amountCents: 240_000,
      description: 'Salário',
      category: 'Salário',
      date: TODAY,
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.type).toBe('income');
    expect(created.amountCents).toBe(240_000);
    expect(created.date).toBe(TODAY);
    expect(created.createdAt).toBeTruthy();
    expect(services.transactions.getById(created.id)).toEqual(created);
  });

  it('cria uma saída', () => {
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 8_000,
      description: 'Combustível',
      category: 'Transporte',
      date: TODAY,
    });

    expect(created.type).toBe('expense');
    expect(services.analytics.currentBalanceCents()).toBe(-8_000);
  });

  it('edita uma transação e recalcula o saldo', () => {
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 8_000,
      description: 'Combustível',
      category: 'Transporte',
      date: TODAY,
    });

    const updated = services.transactions.update(created.id, {
      type: 'expense',
      amountCents: 12_000,
      description: 'Combustível (corrigido)',
      category: 'Transporte',
      date: TODAY,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.amountCents).toBe(12_000);
    expect(updated.description).toBe('Combustível (corrigido)');
    expect(services.analytics.currentBalanceCents()).toBe(-12_000);
  });

  it('trocar o tipo na edição inverte o efeito no saldo', () => {
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 50_000,
      description: 'Erro de lançamento',
      category: 'Outros',
      date: TODAY,
    });
    expect(services.analytics.currentBalanceCents()).toBe(-50_000);

    services.transactions.update(created.id, {
      type: 'income',
      amountCents: 50_000,
      description: 'Era uma entrada',
      category: 'Outros',
      date: TODAY,
    });

    expect(services.analytics.currentBalanceCents()).toBe(50_000);
  });

  it('exclui uma transação e recalcula o saldo', () => {
    services.settings.update({ initialBalanceCents: 100_000 });
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 25_000,
      description: 'Compras',
      category: 'Compras',
      date: TODAY,
    });
    expect(services.analytics.currentBalanceCents()).toBe(75_000);

    services.transactions.remove(created.id);

    expect(services.transactions.count()).toBe(0);
    expect(services.analytics.currentBalanceCents()).toBe(100_000);
  });

  it('lança 404 ao buscar, editar ou excluir id inexistente', () => {
    expect(() => services.transactions.getById('nao-existe')).toThrowError(/não encontrada/i);
    expect(() => services.transactions.remove('nao-existe')).toThrowError(/não encontrada/i);
  });

  it('rejeita no banco valores não positivos (última linha de defesa)', () => {
    expect(() =>
      services.transactions.create({
        type: 'expense',
        amountCents: 0,
        description: 'Zero',
        category: 'Outros',
        date: TODAY,
      }),
    ).toThrowError();
  });
});

describe('filtros do histórico', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
    services.transactions.create({
      type: 'income',
      amountCents: 300_000,
      description: 'Salário de agosto',
      category: 'Salário',
      date: TODAY,
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 6_590,
      description: 'Restaurante do Café',
      category: 'Alimentação',
      date: addDays(TODAY, -2),
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 12_000,
      description: 'Combustível',
      category: 'Transporte',
      date: addDays(TODAY, -40),
    });
  });

  it('filtra por tipo', () => {
    expect(services.transactions.list({ type: 'expense' }).total).toBe(2);
    expect(services.transactions.list({ type: 'income' }).total).toBe(1);
  });

  it('filtra por categoria', () => {
    const result = services.transactions.list({ category: 'Transporte' });
    expect(result.total).toBe(1);
    expect(result.items[0]?.description).toBe('Combustível');
  });

  it('filtra por intervalo de datas', () => {
    expect(
      services.transactions.list({ from: addDays(TODAY, -29), to: TODAY }).total,
    ).toBe(2);
  });

  it('busca ignorando maiúsculas e acentos', () => {
    expect(services.transactions.list({ search: 'cafe' }).total).toBe(1);
    expect(services.transactions.list({ search: 'CAFÉ' }).total).toBe(1);
    expect(services.transactions.list({ search: 'combustivel' }).total).toBe(1);
  });

  it('busca também pela categoria', () => {
    expect(services.transactions.list({ search: 'alimentacao' }).total).toBe(1);
  });

  it('trata curingas do LIKE como texto literal', () => {
    expect(services.transactions.list({ search: '%' }).total).toBe(0);
  });

  it('ordena da transação mais recente para a mais antiga', () => {
    const { items } = services.transactions.list({});
    expect(items.map((item) => item.date)).toEqual([TODAY, addDays(TODAY, -2), addDays(TODAY, -40)]);
  });

  it('pagina os resultados', () => {
    const page = services.transactions.list({ limit: 2, offset: 0 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(services.transactions.list({ limit: 2, offset: 2 }).items).toHaveLength(1);
  });
});

describe('resumo e estatísticas por mês de calendário', () => {
  let services: Services;

  // Data fixa: os períodos são meses fechados, então o resultado não pode
  // depender do dia em que a suíte roda.
  const REFERENCE = new Date(2026, 7, 15); // 15/08/2026
  const thisMonth = resolveRange({ period: 'month', now: REFERENCE });
  const quarter = resolveRange({ period: '3m', now: REFERENCE });
  const year = resolveRange({ period: 'year', now: REFERENCE });
  const everything = resolveRange({ period: 'all', now: REFERENCE });

  beforeEach(() => {
    services = setup();
    services.settings.update({ initialBalanceCents: 1_000_000 });

    // Dentro do mês corrente
    services.transactions.create({
      type: 'income',
      amountCents: 480_000,
      description: 'Salário',
      category: 'Salário',
      date: '2026-08-05',
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 150_000,
      description: 'Aluguel',
      category: 'Moradia',
      date: '2026-08-05',
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 85_000,
      description: 'Mercado',
      category: 'Alimentação',
      date: '2026-08-14',
    });
    // Fora do mês, mas dentro do trimestre
    services.transactions.create({
      type: 'expense',
      amountCents: 999_900,
      description: 'Notebook',
      category: 'Compras',
      date: '2026-06-20',
    });
    // Fora do trimestre, dentro do ano
    services.transactions.create({
      type: 'expense',
      amountCents: 50_000,
      description: 'Curso',
      category: 'Faculdade',
      date: '2026-03-10',
    });
  });

  it('"Este mês" vai do dia 1 ao último dia do mês', () => {
    expect(thisMonth.from).toBe('2026-08-01');
    expect(thisMonth.to).toBe('2026-08-31');
  });

  it('soma apenas o que está dentro do mês corrente', () => {
    const summary = services.analytics.getSummary(thisMonth);
    expect(summary.incomeCents).toBe(480_000);
    expect(summary.expenseCents).toBe(235_000);
    expect(summary.netCents).toBe(245_000);
    expect(summary.transactionCount).toBe(3);
  });

  it('"Últimos 3 meses" cobre três meses inteiros', () => {
    expect(quarter.from).toBe('2026-06-01');
    expect(quarter.to).toBe('2026-08-31');

    const summary = services.analytics.getSummary(quarter);
    expect(summary.expenseCents).toBe(235_000 + 999_900);
    expect(summary.transactionCount).toBe(4);
  });

  it('"Este ano" cobre janeiro a dezembro', () => {
    expect(year.from).toBe('2026-01-01');
    expect(year.to).toBe('2026-12-31');
    expect(services.analytics.getSummary(year).expenseCents).toBe(1_284_900);
  });

  it('mantém o saldo atual como visão de toda a história', () => {
    const summary = services.analytics.getSummary(thisMonth);
    // 1.000.000 + 480.000 − 235.000 − 999.900 − 50.000
    expect(summary.currentBalanceCents).toBe(195_100);
    expect(summary.initialBalanceCents).toBe(1_000_000);
  });

  it('calcula o saldo de abertura do período', () => {
    const summary = services.analytics.getSummary(thisMonth);
    // Antes de 01/08 existiam as saídas de 999.900 e 50.000
    expect(summary.openingBalanceCents).toBe(1_000_000 - 999_900 - 50_000);
  });

  it('inclui tudo no período "all", sem limite nas duas pontas', () => {
    expect(everything.from).toBeNull();
    expect(everything.to).toBeNull();

    const summary = services.analytics.getSummary(everything);
    expect(summary.expenseCents).toBe(1_284_900);
    expect(summary.netCents).toBe(480_000 - 1_284_900);
    expect(summary.openingBalanceCents).toBe(1_000_000);
  });

  it('gera uma série diária cobrindo o mês inteiro, sem buracos', () => {
    const statistics = services.analytics.getStatistics(thisMonth);
    expect(statistics.range.granularity).toBe('day');
    expect(statistics.series).toHaveLength(31);
    expect(statistics.series.at(0)?.bucket).toBe('2026-08-01');
    expect(statistics.series.at(-1)?.bucket).toBe('2026-08-31');

    const fifth = statistics.series.find((point) => point.bucket === '2026-08-05');
    expect(fifth?.incomeCents).toBe(480_000);
    expect(fifth?.expenseCents).toBe(150_000);
  });

  it('acumula o saldo ao longo da série a partir do saldo de abertura', () => {
    const statistics = services.analytics.getStatistics(thisMonth);
    expect(statistics.series.at(-1)?.balanceCents).toBe(services.analytics.currentBalanceCents());
  });

  it('mantém a granularidade diária em três meses (92 dias no máximo)', () => {
    const statistics = services.analytics.getStatistics(quarter);
    expect(statistics.range.granularity).toBe('day');
    expect(statistics.series).toHaveLength(92);
  });

  it('agrupa por mês em períodos longos', () => {
    const statistics = services.analytics.getStatistics(year);
    expect(statistics.range.granularity).toBe('month');
    expect(statistics.series).toHaveLength(12);
    expect(statistics.series.every((point) => /^\d{4}-\d{2}$/.test(point.bucket))).toBe(true);
  });

  it('distribui os gastos por categoria com percentuais', () => {
    const { expensesByCategory } = services.analytics.getStatistics(thisMonth);
    expect(expensesByCategory.map((slice) => slice.category)).toEqual(['Moradia', 'Alimentação']);
    expect(expensesByCategory[0]?.totalCents).toBe(150_000);
    expect(expensesByCategory[0]?.percent).toBeCloseTo(63.8, 1);
    const totalPercent = expensesByCategory.reduce((sum, slice) => sum + slice.percent, 0);
    expect(totalPercent).toBeCloseTo(100, 0);
  });

  it('devolve estatísticas coerentes com o banco vazio', () => {
    const empty = setup();
    const statistics = empty.analytics.getStatistics(resolveRange({ period: 'month' }));
    expect(statistics.totals).toEqual({ incomeCents: 0, expenseCents: 0, netCents: 0 });
    expect(statistics.expensesByCategory).toEqual([]);
    expect(statistics.series.every((point) => point.balanceCents === 0)).toBe(true);
  });

  it('em "Tudo" a série alcança lançamentos futuros', () => {
    const future = setup();
    future.transactions.create({
      type: 'expense',
      amountCents: 30_000,
      description: 'Parcela agendada',
      category: 'Compras',
      date: addDays(TODAY, 40),
    });

    const statistics = future.analytics.getStatistics(resolveRange({ period: 'all' }));
    expect(statistics.series.at(-1)?.bucket.startsWith(addDays(TODAY, 40).slice(0, 7))).toBe(true);
    expect(statistics.totals.expenseCents).toBe(30_000);
  });
});

describe('reset total', () => {
  it('apaga transações e configurações, voltando ao estado inicial', () => {
    const services = setup();
    services.settings.update({ initialBalanceCents: 1_000_000 });
    services.transactions.create({
      type: 'expense',
      amountCents: 25_000,
      description: 'Compras',
      category: 'Compras',
      date: TODAY,
    });
    services.transactions.create({
      type: 'income',
      amountCents: 80_000,
      description: 'Freelance',
      category: 'Freelance',
      date: TODAY,
    });

    const result = services.maintenance.resetAll();

    expect(result.deletedTransactions).toBe(2);
    expect(result.clearedSettings).toBe(true);
    expect(services.transactions.count()).toBe(0);
    expect(services.settings.get().initialBalanceCents).toBe(0);
    expect(services.analytics.currentBalanceCents()).toBe(0);
  });

  it('continua utilizável depois do reset', () => {
    const services = setup();
    services.transactions.create({
      type: 'income',
      amountCents: 10_000,
      description: 'Antes',
      category: 'Outros',
      date: TODAY,
    });
    services.maintenance.resetAll();

    services.settings.update({ initialBalanceCents: 5_000 });
    services.transactions.create({
      type: 'income',
      amountCents: 2_000,
      description: 'Depois',
      category: 'Outros',
      date: TODAY,
    });

    expect(services.transactions.count()).toBe(1);
    expect(services.analytics.currentBalanceCents()).toBe(7_000);
  });

  it('é seguro rodar num banco já vazio', () => {
    const services = setup();
    expect(services.maintenance.resetAll()).toEqual({
      deletedTransactions: 0,
      deletedAccounts: 0,
      deletedBudgets: 0,
      deletedRecurrences: 0,
      clearedSettings: false,
    });
  });
});

describe('validação de entrada', () => {
  const valid = {
    type: 'expense' as const,
    amountCents: 8_000,
    description: 'Combustível',
    category: 'Transporte',
    date: TODAY,
  };

  it('aceita uma transação válida', () => {
    expect(transactionBodySchema.safeParse(valid).success).toBe(true);
  });

  it('recusa valor zero, negativo ou fracionado', () => {
    expect(transactionBodySchema.safeParse({ ...valid, amountCents: 0 }).success).toBe(false);
    expect(transactionBodySchema.safeParse({ ...valid, amountCents: -100 }).success).toBe(false);
    expect(transactionBodySchema.safeParse({ ...valid, amountCents: 10.5 }).success).toBe(false);
    expect(transactionBodySchema.safeParse({ ...valid, amountCents: Number.NaN }).success).toBe(
      false,
    );
  });

  it('recusa valores absurdamente altos', () => {
    expect(
      transactionBodySchema.safeParse({ ...valid, amountCents: 100_000_000_001 }).success,
    ).toBe(false);
  });

  it('recusa descrição vazia ou gigante', () => {
    expect(transactionBodySchema.safeParse({ ...valid, description: '   ' }).success).toBe(false);
    expect(
      transactionBodySchema.safeParse({ ...valid, description: 'x'.repeat(141) }).success,
    ).toBe(false);
  });

  it('recusa datas inválidas', () => {
    for (const date of ['2026-02-30', '09/08/2026', '2026-13-01', 'ontem', '', '1899-12-31']) {
      expect(transactionBodySchema.safeParse({ ...valid, date }).success).toBe(false);
    }
  });

  it('recusa tipo fora do domínio', () => {
    expect(transactionBodySchema.safeParse({ ...valid, type: 'entrada' }).success).toBe(false);
  });

  it('remove espaços em volta de descrição e categoria', () => {
    const parsed = transactionBodySchema.parse({ ...valid, description: '  Café  ' });
    expect(parsed.description).toBe('Café');
  });
});

describe('utilitários de data e período', () => {
  it('valida datas do calendário', () => {
    expect(isValidIsoDate('2026-08-09')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // bissexto
    expect(isValidIsoDate('2025-02-29')).toBe(false);
    expect(isValidIsoDate('2026-8-9')).toBe(false);
  });

  it('soma dias atravessando meses e anos', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('conta os dias entre duas datas', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30);
    expect(eachDay('2026-08-01', '2026-08-31')).toHaveLength(31);
  });

  it('encontra o último dia de cada mês', () => {
    expect(endOfMonth('2026-08-09')).toBe('2026-08-31');
    expect(endOfMonth('2026-04-15')).toBe('2026-04-30');
    expect(endOfMonth('2026-02-01')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-01')).toBe('2024-02-29'); // bissexto
  });

  it('monta os períodos como meses de calendário fechados', () => {
    const reference = new Date(2026, 7, 9); // 09/08/2026 local

    expect(resolveRange({ period: 'month', now: reference })).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      period: 'month',
    });
    expect(resolveRange({ period: '3m', now: reference })).toEqual({
      from: '2026-06-01',
      to: '2026-08-31',
      period: '3m',
    });
    expect(resolveRange({ period: '6m', now: reference }).from).toBe('2026-03-01');
    expect(resolveRange({ period: 'year', now: reference })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      period: 'year',
    });
    expect(resolveRange({ period: 'all', now: reference })).toEqual({
      from: null,
      to: null,
      period: 'all',
    });
  });

  it('atravessa a virada de ano ao recuar meses', () => {
    const reference = new Date(2026, 0, 20); // 20/01/2026
    expect(resolveRange({ period: '3m', now: reference }).from).toBe('2025-11-01');
    expect(resolveRange({ period: '6m', now: reference }).from).toBe('2025-08-01');
    expect(resolveRange({ period: '3m', now: reference }).to).toBe('2026-01-31');
  });

  it('não escorrega o mês quando a referência cai no dia 31', () => {
    const reference = new Date(2026, 2, 31); // 31/03/2026 — fevereiro não tem dia 31
    expect(resolveRange({ period: '3m', now: reference }).from).toBe('2026-01-01');
    expect(resolveRange({ period: 'month', now: reference }).to).toBe('2026-03-31');
  });
});

describe('navegação entre períodos', () => {
  it('monta o período em torno da data de referência, não de hoje', () => {
    expect(resolveRange({ period: 'month', reference: '2026-05-17' })).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
      period: 'month',
    });
    expect(resolveRange({ period: '3m', reference: '2025-02-10' })).toEqual({
      from: '2024-12-01',
      to: '2025-02-28',
      period: '3m',
    });
    expect(resolveRange({ period: 'year', reference: '2024-06-30' }).from).toBe('2024-01-01');
  });

  it('recua uma janela inteira no período anterior', () => {
    expect(previousRange({ period: 'month', reference: '2026-08-15' })).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      period: 'month',
    });
    expect(previousRange({ period: '3m', reference: '2026-08-15' })).toEqual({
      from: '2026-03-01',
      to: '2026-05-31',
      period: '3m',
    });
    expect(previousRange({ period: 'year', reference: '2026-08-15' })?.from).toBe('2025-01-01');
  });

  it('não existe período anterior a "Tudo"', () => {
    expect(previousRange({ period: 'all', reference: '2026-08-15' })).toBeNull();
  });

  it('atravessa a virada de ano ao recuar', () => {
    expect(previousRange({ period: 'month', reference: '2026-01-10' })?.from).toBe('2025-12-01');
  });

  it('lê o consumo de meses passados sem alterar o saldo atual', () => {
    const services = setup();
    services.transactions.create({
      type: 'expense',
      amountCents: 40_000,
      description: 'Gasto de junho',
      category: 'Lazer',
      date: '2026-06-12',
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 10_000,
      description: 'Gasto de agosto',
      category: 'Lazer',
      date: '2026-08-12',
    });

    const june = services.analytics.getSummary(resolveRange({ period: 'month', reference: '2026-06-20' }));
    const august = services.analytics.getSummary(resolveRange({ period: 'month', reference: '2026-08-20' }));

    expect(june.expenseCents).toBe(40_000);
    expect(august.expenseCents).toBe(10_000);
    expect(june.currentBalanceCents).toBe(august.currentBalanceCents);
  });
});

describe('comparativo com o período anterior', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
    // Julho
    services.transactions.create({
      type: 'income',
      amountCents: 400_000,
      description: 'Salário',
      category: 'Salário',
      date: '2026-07-05',
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 200_000,
      description: 'Gastos de julho',
      category: 'Compras',
      date: '2026-07-20',
    });
    // Agosto
    services.transactions.create({
      type: 'income',
      amountCents: 500_000,
      description: 'Salário',
      category: 'Salário',
      date: '2026-08-05',
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 150_000,
      description: 'Gastos de agosto',
      category: 'Compras',
      date: '2026-08-20',
    });
  });

  function statisticsFor(reference: string) {
    return services.analytics.getStatistics(
      resolveRange({ period: 'month', reference }),
      previousRange({ period: 'month', reference }),
    );
  }

  it('traz os totais do mês anterior e a variação percentual', () => {
    const { comparison } = statisticsFor('2026-08-15');

    expect(comparison?.range.from).toBe('2026-07-01');
    expect(comparison?.totals.incomeCents).toBe(400_000);
    expect(comparison?.totals.expenseCents).toBe(200_000);
    expect(comparison?.incomeChangePercent).toBe(25); // 400k → 500k
    expect(comparison?.expenseChangePercent).toBe(-25); // 200k → 150k
  });

  it('devolve variação nula quando o período anterior foi zero', () => {
    const { comparison } = statisticsFor('2026-07-15');
    expect(comparison?.totals.incomeCents).toBe(0);
    expect(comparison?.incomeChangePercent).toBeNull();
  });

  it('não compara quando não há período anterior', () => {
    const statistics = services.analytics.getStatistics(resolveRange({ period: 'all' }), null);
    expect(statistics.comparison).toBeNull();
  });
});

describe('limites de gastos por categoria', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
    services.transactions.create({
      type: 'expense',
      amountCents: 30_000,
      description: 'Cinema',
      category: 'Lazer',
      date: '2026-08-04',
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 25_000,
      description: 'Bar',
      category: 'Lazer',
      date: '2026-08-18',
    });
    // Mês anterior: só entra na janela quando o limite abrange 2+ meses.
    services.transactions.create({
      type: 'expense',
      amountCents: 40_000,
      description: 'Show',
      category: 'Lazer',
      date: '2026-07-10',
    });
    // Outra categoria não conta.
    services.transactions.create({
      type: 'expense',
      amountCents: 90_000,
      description: 'Mercado',
      category: 'Alimentação',
      date: '2026-08-06',
    });
    // Entradas nunca contam num limite de gasto.
    services.transactions.create({
      type: 'income',
      amountCents: 70_000,
      description: 'Reembolso do show',
      category: 'Lazer',
      date: '2026-08-19',
    });
  });

  it('soma apenas as saídas da categoria dentro da janela', () => {
    services.budgets.create({ category: 'Lazer', limitCents: 100_000, months: 1 });

    const [budget] = services.budgets.listWithUsage('2026-08-15');
    expect(budget?.window).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(budget?.spentCents).toBe(55_000);
    expect(budget?.remainingCents).toBe(45_000);
    expect(budget?.percent).toBe(55);
    expect(budget?.status).toBe('ok');
  });

  it('a janela cresce conforme o número de meses escolhido', () => {
    services.budgets.create({ category: 'Lazer', limitCents: 200_000, months: 2 });

    const [budget] = services.budgets.listWithUsage('2026-08-15');
    expect(budget?.window).toEqual({ from: '2026-07-01', to: '2026-08-31' });
    expect(budget?.spentCents).toBe(95_000); // inclui o show de julho
  });

  it('avisa a partir de 90% e marca o estouro acima de 100%', () => {
    const budget = services.budgets.create({ category: 'Lazer', limitCents: 60_000, months: 1 });
    expect(services.budgets.listWithUsage('2026-08-15')[0]?.status).toBe('warning');
    expect(services.budgets.listWithUsage('2026-08-15')[0]?.percent).toBeCloseTo(91.7, 1);

    services.budgets.update(budget.id, { category: 'Lazer', limitCents: 50_000, months: 1 });
    const exceeded = services.budgets.listWithUsage('2026-08-15')[0];
    expect(exceeded?.status).toBe('exceeded');
    expect(exceeded?.percent).toBe(110);
    expect(exceeded?.remainingCents).toBe(-5_000);
  });

  it('acompanha o mês de referência escolhido', () => {
    services.budgets.create({ category: 'Lazer', limitCents: 100_000, months: 1 });
    expect(services.budgets.listWithUsage('2026-07-15')[0]?.spentCents).toBe(40_000);
    expect(services.budgets.listWithUsage('2026-05-15')[0]?.spentCents).toBe(0);
  });

  it('recusa dois limites para a mesma categoria', () => {
    services.budgets.create({ category: 'Lazer', limitCents: 100_000, months: 1 });
    expect(() => services.budgets.create({ category: 'Lazer', limitCents: 50_000, months: 1 })).toThrowError(
      /Já existe um limite/i,
    );
  });

  it('edita e exclui limites', () => {
    const budget = services.budgets.create({ category: 'Lazer', limitCents: 100_000, months: 1 });

    const updated = services.budgets.update(budget.id, {
      category: 'Alimentação',
      limitCents: 120_000,
      months: 3,
    });
    expect(updated.category).toBe('Alimentação');
    expect(updated.months).toBe(3);

    services.budgets.remove(budget.id);
    expect(services.budgets.count()).toBe(0);
    expect(() => services.budgets.remove(budget.id)).toThrowError(/não encontrado/i);
  });

  it('o reset também apaga os limites', () => {
    services.budgets.create({ category: 'Lazer', limitCents: 100_000, months: 1 });
    expect(services.maintenance.resetAll().deletedBudgets).toBe(1);
    expect(services.budgets.count()).toBe(0);
  });
});

describe('transações vinculadas a contas', () => {
  let services: Services;
  let nubank: { id: string; name: string };

  beforeEach(() => {
    services = setup();
    nubank = services.accounts.create({ name: 'Nubank', balanceCents: 100_000 });
  });

  it('guarda o vínculo e devolve o nome da conta', () => {
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 5_000,
      description: 'Almoço',
      category: 'Alimentação',
      date: TODAY,
      accountId: nubank.id,
    });

    expect(created.accountId).toBe(nubank.id);
    expect(created.accountName).toBe('Nubank');
  });

  it('aceita transação sem conta', () => {
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 5_000,
      description: 'Almoço',
      category: 'Alimentação',
      date: TODAY,
    });

    expect(created.accountId).toBeNull();
    expect(created.accountName).toBeNull();
  });

  it('recusa uma conta inexistente', () => {
    expect(() =>
      services.transactions.create({
        type: 'expense',
        amountCents: 5_000,
        description: 'Almoço',
        category: 'Alimentação',
        date: TODAY,
        accountId: 'nao-existe',
      }),
    ).toThrowError(/conta escolhida não existe/i);
  });

  it('filtra o histórico por conta', () => {
    const itau = services.accounts.create({ name: 'Itaú', balanceCents: 0 });
    services.transactions.create({
      type: 'expense',
      amountCents: 5_000,
      description: 'Almoço',
      category: 'Alimentação',
      date: TODAY,
      accountId: nubank.id,
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 8_000,
      description: 'Uber',
      category: 'Transporte',
      date: TODAY,
      accountId: itau.id,
    });

    expect(services.transactions.list({ accountId: nubank.id }).total).toBe(1);
    expect(services.transactions.list({ accountId: itau.id }).items[0]?.description).toBe('Uber');
  });

  it('apagar a conta preserva a transação, apenas desvinculando', () => {
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 5_000,
      description: 'Almoço',
      category: 'Alimentação',
      date: TODAY,
      accountId: nubank.id,
    });

    services.accounts.remove(nubank.id);

    const kept = services.transactions.getById(created.id);
    expect(kept.accountId).toBeNull();
    expect(kept.amountCents).toBe(5_000);
    expect(services.transactions.count()).toBe(1);
  });

  it('permite desvincular na edição', () => {
    const created = services.transactions.create({
      type: 'expense',
      amountCents: 5_000,
      description: 'Almoço',
      category: 'Alimentação',
      date: TODAY,
      accountId: nubank.id,
    });

    const updated = services.transactions.update(created.id, {
      type: 'expense',
      amountCents: 5_000,
      description: 'Almoço',
      category: 'Alimentação',
      date: TODAY,
      accountId: null,
    });

    expect(updated.accountId).toBeNull();
  });
});

describe('contas', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
  });

  it('cria contas e devolve na ordem de inclusão', () => {
    services.accounts.create({ name: 'Nubank', balanceCents: 250_000 });
    services.accounts.create({ name: 'Itaú', balanceCents: 800_000 });
    services.accounts.create({ name: 'Carteira', balanceCents: 15_000 });

    expect(services.accounts.list().map((account) => account.name)).toEqual([
      'Nubank',
      'Itaú',
      'Carteira',
    ]);
  });

  it('soma o saldo de todas as contas', () => {
    services.accounts.create({ name: 'Nubank', balanceCents: 250_000 });
    services.accounts.create({ name: 'Itaú', balanceCents: 800_000 });
    expect(services.accounts.totalBalanceCents()).toBe(1_050_000);
  });

  it('edita e exclui contas', () => {
    const account = services.accounts.create({ name: 'Nubnak', balanceCents: 100 });

    const updated = services.accounts.update(account.id, {
      name: 'Nubank',
      balanceCents: 250_000,
    });
    expect(updated.name).toBe('Nubank');
    expect(updated.balanceCents).toBe(250_000);

    services.accounts.remove(account.id);
    expect(services.accounts.count()).toBe(0);
    expect(services.accounts.totalBalanceCents()).toBe(0);
  });

  it('lança 404 para conta inexistente', () => {
    expect(() => services.accounts.getById('nao-existe')).toThrowError(/não encontrada/i);
    expect(() => services.accounts.remove('nao-existe')).toThrowError(/não encontrada/i);
  });
});

describe('saldo inicial com múltiplas contas', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
    services.settings.update({ initialBalanceCents: 300_000 });
    services.accounts.create({ name: 'Nubank', balanceCents: 250_000 });
    services.accounts.create({ name: 'Itaú', balanceCents: 800_000 });
  });

  it('usa o valor digitado enquanto a opção está desmarcada', () => {
    const settings = services.settings.get();
    expect(settings.useMultipleAccounts).toBe(false);
    expect(settings.initialBalanceCents).toBe(300_000);
    expect(settings.accountsTotalCents).toBe(1_050_000);
    expect(services.analytics.currentBalanceCents()).toBe(300_000);
  });

  it('passa a usar a soma das contas quando a opção é marcada', () => {
    services.settings.update({ useMultipleAccounts: true });

    const settings = services.settings.get();
    expect(settings.initialBalanceCents).toBe(1_050_000);
    expect(services.analytics.currentBalanceCents()).toBe(1_050_000);
  });

  it('preserva o valor digitado para quando a opção for desmarcada', () => {
    services.settings.update({ useMultipleAccounts: true });
    expect(services.settings.get().manualInitialBalanceCents).toBe(300_000);

    services.settings.update({ useMultipleAccounts: false });
    expect(services.settings.get().initialBalanceCents).toBe(300_000);
  });

  it('acompanha alterações nas contas em tempo real', () => {
    services.settings.update({ useMultipleAccounts: true });
    const extra = services.accounts.create({ name: 'Poupança', balanceCents: 150_000 });
    expect(services.settings.get().initialBalanceCents).toBe(1_200_000);

    services.accounts.remove(extra.id);
    expect(services.settings.get().initialBalanceCents).toBe(1_050_000);
  });

  it('cai para zero se a opção está marcada e não há contas', () => {
    const empty = setup();
    empty.settings.update({ initialBalanceCents: 500_000, useMultipleAccounts: true });
    expect(empty.settings.get().initialBalanceCents).toBe(0);
  });

  it('o reset também apaga as contas', () => {
    services.settings.update({ useMultipleAccounts: true });
    const result = services.maintenance.resetAll();

    expect(result.deletedAccounts).toBe(2);
    expect(services.accounts.count()).toBe(0);
    expect(services.settings.get().useMultipleAccounts).toBe(false);
    expect(services.settings.get().initialBalanceCents).toBe(0);
  });
});

describe('transferência entre contas', () => {
  let services: Services;
  let origem: string;
  let destino: string;

  const range = resolveRange({ period: 'all' });

  function transferir(amountCents: number): void {
    services.transactions.create({
      type: 'transfer',
      amountCents,
      description: 'Guardar dinheiro',
      category: 'ignorada',
      date: TODAY,
      accountId: origem,
      transferAccountId: destino,
    });
  }

  beforeEach(() => {
    services = setup();
    origem = services.accounts.create({ name: 'Conta corrente', balanceCents: 300_000 }).id;
    destino = services.accounts.create({ name: 'Poupança', balanceCents: 100_000 }).id;
    services.settings.update({ useMultipleAccounts: true });
  });

  it('move o dinheiro de uma conta para a outra', () => {
    transferir(50_000);

    const [corrente, poupanca] = services.accounts.list();
    expect(corrente?.currentBalanceCents).toBe(250_000);
    expect(poupanca?.currentBalanceCents).toBe(150_000);
  });

  it('não é entrada nem saída: o saldo total não se mexe', () => {
    const antes = services.analytics.currentBalanceCents();
    transferir(50_000);

    expect(services.analytics.currentBalanceCents()).toBe(antes);

    const summary = services.analytics.getSummary(range);
    expect(summary.incomeCents).toBe(0);
    expect(summary.expenseCents).toBe(0);
    expect(summary.netCents).toBe(0);
    expect(summary.transactionCount).toBe(0);
  });

  it('fica fora da distribuição por categoria e dos limites de gasto', () => {
    services.budgets.create({ category: 'Transferência', limitCents: 10_000, months: 1 });
    transferir(50_000);

    const statistics = services.analytics.getStatistics(range);
    expect(statistics.expensesByCategory).toEqual([]);
    expect(statistics.series.every((point) => point.expenseCents === 0)).toBe(true);
    expect(services.budgets.listWithUsage()[0]?.spentCents).toBe(0);
  });

  it('guarda a categoria própria, sem deixar o usuário escolher', () => {
    transferir(50_000);
    expect(services.transactions.list().items[0]?.category).toBe('Transferência');
  });

  it('recusa destino igual à origem, ou sem destino', () => {
    expect(() =>
      services.transactions.create({
        type: 'transfer',
        amountCents: 1_000,
        description: 'x',
        category: 'x',
        date: TODAY,
        accountId: origem,
        transferAccountId: origem,
      }),
    ).toThrow(/diferente/i);

    expect(() =>
      services.transactions.create({
        type: 'transfer',
        amountCents: 1_000,
        description: 'x',
        category: 'x',
        date: TODAY,
        accountId: origem,
      }),
    ).toThrow(/origem e a de destino/i);
  });

  it('apagar a conta de destino não apaga a transferência', () => {
    transferir(50_000);
    services.accounts.remove(destino);

    const transferencia = services.transactions.list().items[0];
    expect(transferencia?.type).toBe('transfer');
    expect(transferencia?.transferAccountId).toBeNull();
  });
});

describe('saldo atual de cada conta', () => {
  let services: Services;

  beforeEach(() => {
    services = setup();
  });

  it('parte do saldo inicial e aplica o que passou pela conta', () => {
    const conta = services.accounts.create({ name: 'Nubank', balanceCents: 100_000 });
    services.transactions.create({
      type: 'income',
      amountCents: 40_000,
      description: 'Salário',
      category: 'Salário',
      date: TODAY,
      accountId: conta.id,
    });
    services.transactions.create({
      type: 'expense',
      amountCents: 15_000,
      description: 'Mercado',
      category: 'Alimentação',
      date: TODAY,
      accountId: conta.id,
    });

    const atualizada = services.accounts.getById(conta.id);
    expect(atualizada.balanceCents).toBe(100_000); // o inicial não muda
    expect(atualizada.currentBalanceCents).toBe(125_000);
  });

  it('não conta o que não está vinculado a conta nenhuma', () => {
    const conta = services.accounts.create({ name: 'Nubank', balanceCents: 100_000 });
    services.transactions.create({
      type: 'expense',
      amountCents: 30_000,
      description: 'Solta',
      category: 'Outros',
      date: TODAY,
    });

    expect(services.accounts.getById(conta.id).currentBalanceCents).toBe(100_000);
    expect(services.accounts.unlinkedNetCents()).toBe(-30_000);
  });
});

describe('compra parcelada', () => {
  let services: Services;

  const COMPRA = {
    type: 'expense' as const,
    description: 'Câmera',
    category: 'Compras',
    date: '2026-08-10',
  };

  beforeEach(() => {
    services = setup();
  });

  it('divide o total em parcelas mensais, com a sobra na primeira', () => {
    const parcelas = services.transactions.createInstallments({
      ...COMPRA,
      amountCents: 100_000,
      installments: 3,
      amountIs: 'total',
    });

    expect(parcelas.map((parcela) => parcela.amountCents)).toEqual([33_334, 33_333, 33_333]);
    // A soma das parcelas é exatamente o preço da compra.
    expect(parcelas.reduce((soma, parcela) => soma + parcela.amountCents, 0)).toBe(100_000);
    expect(parcelas.map((parcela) => parcela.date)).toEqual([
      '2026-08-10',
      '2026-09-10',
      '2026-10-10',
    ]);
  });

  it('multiplica quando o valor informado é o de cada parcela', () => {
    const parcelas = services.transactions.createInstallments({
      ...COMPRA,
      amountCents: 20_000,
      installments: 10,
      amountIs: 'installment',
    });

    expect(parcelas).toHaveLength(10);
    expect(parcelas.every((parcela) => parcela.amountCents === 20_000)).toBe(true);
    expect(services.analytics.currentBalanceCents()).toBe(-200_000);
  });

  it('numera as parcelas e mantém todas no mesmo grupo', () => {
    const parcelas = services.transactions.createInstallments({
      ...COMPRA,
      amountCents: 60_000,
      installments: 3,
      amountIs: 'total',
    });

    expect(parcelas.map((parcela) => parcela.installmentNumber)).toEqual([1, 2, 3]);
    expect(parcelas.every((parcela) => parcela.installmentTotal === 3)).toBe(true);
    expect(new Set(parcelas.map((parcela) => parcela.installmentGroup)).size).toBe(1);
  });

  it('cada parcela cai no mês dela', () => {
    services.transactions.createInstallments({
      ...COMPRA,
      amountCents: 30_000,
      installments: 3,
      amountIs: 'total',
    });

    const agosto = resolveRange({ period: 'month', reference: '2026-08-15' });
    expect(services.analytics.getSummary(agosto).expenseCents).toBe(10_000);
  });

  it('apaga a compra inteira ou só uma parcela, conforme o pedido', () => {
    const parcelas = services.transactions.createInstallments({
      ...COMPRA,
      amountCents: 30_000,
      installments: 3,
      amountIs: 'total',
    });

    services.transactions.remove(parcelas[1]!.id);
    expect(services.transactions.count()).toBe(2);

    expect(services.transactions.removeInstallmentGroup(parcelas[0]!.id)).toBe(2);
    expect(services.transactions.count()).toBe(0);
  });

  it('sem grupo, apagar "o grupo" apaga só aquela transação', () => {
    const avulsa = services.transactions.create({ ...COMPRA, amountCents: 5_000 });
    expect(services.transactions.removeInstallmentGroup(avulsa.id)).toBe(1);
    expect(services.transactions.count()).toBe(0);
  });
});

describe('datas em que uma recorrência cai', () => {
  function rule(overrides: Partial<Recurrence> = {}): Recurrence {
    return {
      id: 'regra',
      type: 'expense',
      amountCents: 10_000,
      description: 'Assinatura',
      category: 'Assinaturas',
      accountId: null,
      frequency: 'monthly',
      dayOfMonth: 1,
      weekday: 1,
      month: 1,
      startDate: '2026-01-01',
      endDate: null,
      active: true,
      lastRunDate: null,
      createdAt: '',
      updatedAt: '',
      ...overrides,
    };
  }

  it('encolhe o dia 31 nos meses que não têm', () => {
    const dates = occurrencesBetween(rule({ dayOfMonth: 31 }), '2026-01-01', '2026-04-30');
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('semanal cai sempre no mesmo dia da semana', () => {
    // 10/08/2026 é uma segunda-feira.
    const dates = occurrencesBetween(
      rule({ frequency: 'weekly', weekday: 1 }),
      '2026-08-05',
      '2026-08-31',
    );
    expect(dates).toEqual(['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  });

  it('anual cai uma vez por ano, no mês escolhido', () => {
    const dates = occurrencesBetween(
      rule({ frequency: 'yearly', month: 3, dayOfMonth: 10 }),
      '2026-01-01',
      '2028-12-31',
    );
    expect(dates).toEqual(['2026-03-10', '2027-03-10', '2028-03-10']);
  });

  it('não cai antes do início nem depois do fim da própria regra', () => {
    const limited = rule({ dayOfMonth: 15, startDate: '2026-02-20', endDate: '2026-05-01' });
    expect(occurrencesBetween(limited, '2026-01-01', '2026-12-31')).toEqual([
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('a marca d’água move o ponto de partida', () => {
    expect(pendingFrom(rule())).toBe('2026-01-01');
    expect(pendingFrom(rule({ lastRunDate: '2026-03-20' }))).toBe('2026-03-21');
  });

  it('a próxima data considera o que já foi lançado', () => {
    const monthly = rule({ dayOfMonth: 5, lastRunDate: '2026-03-20' });
    expect(nextOccurrence(monthly, pendingFrom(monthly))).toBe('2026-04-05');
  });
});

describe('recorrências', () => {
  let services: Services;

  /** Dia de hoje: usar o mesmo dia do mês deixa o teste independente da data. */
  const TODAY_DAY = Number(TODAY.slice(8, 10));

  const SALARY = {
    type: 'income' as const,
    amountCents: 480_000,
    description: 'Salário',
    category: 'Salário',
    frequency: 'monthly' as const,
    dayOfMonth: 1,
  };

  beforeEach(() => {
    services = setup();
  });

  it('lança de uma vez tudo que venceu desde a data de início', () => {
    services.recurrences.create({ ...SALARY, startDate: startOfMonth(addMonths(TODAY, -2)) });

    // Três dias 1: dois meses atrás, mês passado e este mês.
    expect(services.transactions.count()).toBe(3);
    expect(services.analytics.currentBalanceCents()).toBe(3 * 480_000);
  });

  it('não lança de novo quando o app abre outra vez', () => {
    services.recurrences.create({ ...SALARY, startDate: startOfMonth(addMonths(TODAY, -1)) });
    expect(services.transactions.count()).toBe(2);

    services.recurrences.catchUp();
    services.recurrences.catchUp();

    expect(services.transactions.count()).toBe(2);
  });

  it('não recria um lançamento apagado à mão', () => {
    services.recurrences.create({ ...SALARY, startDate: startOfMonth(addMonths(TODAY, -1)) });
    const apagado = services.transactions.list().items[0];
    services.transactions.remove(apagado!.id);

    services.recurrences.catchUp();

    expect(services.transactions.count()).toBe(1);
  });

  it('respeita a data final', () => {
    services.recurrences.create({
      ...SALARY,
      startDate: startOfMonth(addMonths(TODAY, -3)),
      endDate: endOfMonth(addMonths(TODAY, -2)),
    });
    expect(services.transactions.count()).toBe(2);
  });

  it('pausada não lança nada — e não retroage ao ser retomada', () => {
    const startDate = startOfMonth(addMonths(TODAY, -2));
    const regra = services.recurrences.create({ ...SALARY, startDate, active: false });
    expect(services.transactions.count()).toBe(0);

    services.recurrences.update(regra.id, { ...SALARY, startDate, active: true });

    expect(services.transactions.count()).toBe(0);
  });

  it('marca o lançamento gerado e diz qual é o próximo', () => {
    const regra = services.recurrences.create({
      ...SALARY,
      dayOfMonth: TODAY_DAY,
      startDate: TODAY,
    });

    const gerada = services.transactions.list().items[0];
    expect(gerada?.date).toBe(TODAY);
    expect(gerada?.recurrenceId).toBe(regra.id);
    expect(regra.nextDate).toBe(addMonths(TODAY, 1));
  });

  it('apagar a regra não apaga o que ela já lançou', () => {
    const regra = services.recurrences.create({
      ...SALARY,
      dayOfMonth: TODAY_DAY,
      startDate: TODAY,
    });
    const gerada = services.transactions.list().items[0]!;

    services.recurrences.remove(regra.id);

    expect(services.transactions.count()).toBe(1);
    expect(services.transactions.getById(gerada.id).recurrenceId).toBeNull();
  });

  it('o reset também apaga as recorrências', () => {
    services.recurrences.create({ ...SALARY, dayOfMonth: TODAY_DAY, startDate: TODAY });

    const result = services.maintenance.resetAll();

    expect(result.deletedRecurrences).toBe(1);
    expect(services.recurrences.list()).toHaveLength(0);
  });
});

describe('previsão das recorrências no gráfico', () => {
  let services: Services;

  const TODAY_DAY = Number(TODAY.slice(8, 10));
  const SALARY = {
    type: 'income' as const,
    amountCents: 480_000,
    description: 'Salário',
    category: 'Salário',
    frequency: 'monthly' as const,
    dayOfMonth: TODAY_DAY,
    startDate: TODAY,
  };

  // Quatro meses: passa dos 92 dias, então a série é mensal e o previsto cai em
  // buckets `YYYY-MM` — o mesmo caminho das opções de 3 meses, 6 meses e ano.
  const window = {
    from: startOfMonth(TODAY),
    to: endOfMonth(addMonths(TODAY, 3)),
    period: 'custom' as const,
  };
  const thisMonth = resolveRange({ period: 'month', reference: TODAY });

  beforeEach(() => {
    services = setup();
    services.recurrences.create(SALARY);
  });

  it('desenha o previsto só nos meses que ainda não chegaram', () => {
    const { series } = services.analytics.getStatistics(window);
    const [current, ...ahead] = series;

    // O lançamento de hoje já é real: não pode aparecer duas vezes.
    expect(current?.incomeCents).toBe(480_000);
    expect(current?.pendingIncomeCents).toBe(0);

    expect(ahead).toHaveLength(3);
    expect(ahead.every((point) => point.incomeCents === 0)).toBe(true);
    expect(ahead.every((point) => point.pendingIncomeCents === 480_000)).toBe(true);
  });

  it('o previsto não entra em saldo, totais nem categorias', () => {
    const statistics = services.analytics.getStatistics(window);

    expect(statistics.totals.incomeCents).toBe(480_000);
    expect(statistics.series.at(-1)?.balanceCents).toBe(480_000);
    expect(statistics.incomeByCategory).toEqual([
      { category: 'Salário', totalCents: 480_000, percent: 100, count: 1 },
    ]);
    expect(services.analytics.getSummary(window).incomeCents).toBe(480_000);
    expect(services.analytics.currentBalanceCents()).toBe(480_000);
  });

  it('não projeta nada quando a janela mostra um mês só', () => {
    const { series } = services.analytics.getStatistics(thisMonth);
    expect(series.every((point) => point.pendingIncomeCents === 0)).toBe(true);
    expect(series.every((point) => point.pendingExpenseCents === 0)).toBe(true);
  });

  it('regra pausada some também da previsão', () => {
    const regra = services.recurrences.list()[0]!;
    services.recurrences.update(regra.id, { ...SALARY, active: false });

    const { series } = services.analytics.getStatistics(window);
    expect(series.every((point) => point.pendingIncomeCents === 0)).toBe(true);
  });
});
