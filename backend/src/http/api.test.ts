import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { openDatabase } from '../db/connection';
import { today } from '../domain/dates';
import { createServices } from '../services';

let server: Server;
let baseUrl: string;

const TODAY = today();

beforeAll(async () => {
  const app = createApp(createServices(openDatabase(':memory:')));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const newExpense = {
  type: 'expense',
  amountCents: 8_000,
  description: 'Combustível',
  category: 'Transporte',
  date: TODAY,
};

describe('API', () => {
  it('responde ao health check', async () => {
    const { status, body } = await api('/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('percorre o ciclo completo de uma transação', async () => {
    const created = await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(newExpense),
    });
    expect(created.status).toBe(201);
    const { id } = created.body;
    expect(id).toBeTruthy();

    const listed = await api('/api/transactions');
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((item: { id: string }) => item.id === id)).toBe(true);

    const updated = await api(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...newExpense, amountCents: 9_500, description: 'Gasolina' }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.amountCents).toBe(9_500);
    expect(updated.body.description).toBe('Gasolina');

    const removed = await api(`/api/transactions/${id}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);

    const missing = await api(`/api/transactions/${id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toMatch(/não encontrada/i);
  });

  it('mantém saldo e resumo em sincronia com as transações', async () => {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ initialBalanceCents: 1_000_000 }),
    });
    const income = await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'income',
        amountCents: 240_000,
        description: 'Salário',
        category: 'Salário',
        date: TODAY,
      }),
    });

    const summary = await api('/api/summary?period=month');
    expect(summary.status).toBe(200);
    expect(summary.body.currentBalanceCents).toBe(1_240_000);
    expect(summary.body.incomeCents).toBe(240_000);

    await api(`/api/transactions/${income.body.id}`, { method: 'DELETE' });
    const afterDelete = await api('/api/summary?period=month');
    expect(afterDelete.body.currentBalanceCents).toBe(1_000_000);
    expect(afterDelete.body.incomeCents).toBe(0);
  });

  it('devolve 422 com mensagem amigável para dados inválidos', async () => {
    const { status, body } = await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ ...newExpense, amountCents: 0 }),
    });
    expect(status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Informe um valor maior que zero.');
    expect(body.error.details?.[0]?.field).toBe('amountCents');
  });

  it('devolve 422 para data inválida', async () => {
    const { status, body } = await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ ...newExpense, date: '2026-02-30' }),
    });
    expect(status).toBe(422);
    expect(body.error.message).toBe('Informe uma data válida.');
  });

  it('devolve 422 para período fora do domínio', async () => {
    const { status } = await api('/api/summary?period=30d');
    expect(status).toBe(422);
  });

  it('devolve 400 para JSON malformado', async () => {
    const response = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ isto não é json',
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('devolve 404 em JSON para rotas desconhecidas da API', async () => {
    const { status, body } = await api('/api/inexistente');
    expect(status).toBe(404);
    expect(body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('nunca expõe stack trace nas respostas de erro', async () => {
    const { body } = await api('/api/transactions/id-que-nao-existe');
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:/);
  });

  it('entrega estatísticas do mês prontas para o gráfico', async () => {
    const { status, body } = await api('/api/statistics?period=month');
    expect(status).toBe(200);
    expect(body.range.granularity).toBe('day');
    expect(body.range.from).toMatch(/^\d{4}-\d{2}-01$/);
    // Um ponto por dia do mês corrente — 28, 29, 30 ou 31.
    expect(body.series.length).toBeGreaterThanOrEqual(28);
    expect(body.series.length).toBeLessThanOrEqual(31);
    expect(Array.isArray(body.expensesByCategory)).toBe(true);
  });

  it('entrega o ano agrupado por mês', async () => {
    const { body } = await api('/api/statistics?period=year');
    expect(body.range.granularity).toBe('month');
    expect(body.series).toHaveLength(12);
  });

  it('lista categorias padrão somadas às já utilizadas', async () => {
    const { body } = await api('/api/categories');
    expect(body.expense).toContain('Alimentação');
    expect(body.income).toContain('Salário');
  });

  it('valida o corpo das configurações', async () => {
    const { status, body } = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ initialBalanceCents: 10.5 }),
    });
    expect(status).toBe(422);
    expect(body.error.message).toBe('Informe um saldo inicial válido.');
  });

  it('gerencia contas e liga o saldo inicial à soma delas', async () => {
    const nubank = await api('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Nubank', balanceCents: 250_000 }),
    });
    expect(nubank.status).toBe(201);

    await api('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Itaú', balanceCents: 800_000 }),
    });

    const list = await api('/api/accounts');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.totalCents).toBe(1_050_000);

    // Enquanto a opção está desmarcada, o valor digitado continua valendo.
    expect((await api('/api/settings')).body.initialBalanceCents).toBe(1_000_000);

    const enabled = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ useMultipleAccounts: true }),
    });
    expect(enabled.body.initialBalanceCents).toBe(1_050_000);
    expect(enabled.body.manualInitialBalanceCents).toBe(1_000_000);

    const renamed = await api(`/api/accounts/${nubank.body.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Nubank Conta', balanceCents: 300_000 }),
    });
    expect(renamed.body.name).toBe('Nubank Conta');
    expect((await api('/api/settings')).body.initialBalanceCents).toBe(1_100_000);

    expect((await api(`/api/accounts/${nubank.body.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api('/api/settings')).body.initialBalanceCents).toBe(800_000);

    // Desmarcar devolve o valor digitado.
    const disabled = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ useMultipleAccounts: false }),
    });
    expect(disabled.body.initialBalanceCents).toBe(1_000_000);
  });

  it('recusa conta sem nome', async () => {
    const { status, body } = await api('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: '   ', balanceCents: 100 }),
    });
    expect(status).toBe(422);
    expect(body.error.message).toMatch(/nome/i);
  });

  it('monta o período em torno do mês de referência', async () => {
    const { status, body } = await api('/api/summary?period=month&reference=2026-05-17');
    expect(status).toBe(200);
    expect(body.range.from).toBe('2026-05-01');
    expect(body.range.to).toBe('2026-05-31');
  });

  it('recusa uma referência inválida', async () => {
    const { status, body } = await api('/api/summary?period=month&reference=maio');
    expect(status).toBe(422);
    expect(body.error.message).toBe('Mês de referência inválido.');
  });

  it('inclui o comparativo com o período anterior nas estatísticas', async () => {
    const { body } = await api('/api/statistics?period=month&reference=2026-08-15');
    expect(body.comparison.range.from).toBe('2026-07-01');
    expect(body.comparison.range.to).toBe('2026-07-31');
    expect(body.comparison).toHaveProperty('incomeChangePercent');
  });

  it('não traz comparativo no período "Tudo"', async () => {
    const { body } = await api('/api/statistics?period=all');
    expect(body.comparison).toBeNull();
  });

  it('vincula uma transação a uma conta e permite filtrar por ela', async () => {
    const conta = await api('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Banco do Teste', balanceCents: 0 }),
    });

    const created = await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ ...newExpense, accountId: conta.body.id }),
    });
    expect(created.status).toBe(201);
    expect(created.body.accountId).toBe(conta.body.id);
    expect(created.body.accountName).toBe('Banco do Teste');

    const filtered = await api(`/api/transactions?accountId=${conta.body.id}`);
    expect(filtered.body.total).toBe(1);

    // Apagar a conta desvincula, mas não apaga o lançamento.
    await api(`/api/accounts/${conta.body.id}`, { method: 'DELETE' });
    const kept = await api(`/api/transactions/${created.body.id}`);
    expect(kept.body.accountId).toBeNull();

    await api(`/api/transactions/${created.body.id}`, { method: 'DELETE' });
  });

  it('recusa transação com conta inexistente', async () => {
    const { status, body } = await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ ...newExpense, accountId: 'conta-fantasma' }),
    });
    expect(status).toBe(422);
    expect(body.error.message).toMatch(/conta escolhida não existe/i);
  });

  it('gerencia limites de gasto com o consumo calculado', async () => {
    await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 45_000,
        description: 'Cinema',
        category: 'Lazer',
        date: '2026-08-10',
      }),
    });

    const created = await api('/api/budgets', {
      method: 'POST',
      body: JSON.stringify({ category: 'Lazer', limitCents: 50_000, months: 1 }),
    });
    expect(created.status).toBe(201);

    const listed = await api('/api/budgets?reference=2026-08-15');
    const budget = listed.body.items[0];
    expect(budget.spentCents).toBe(45_000);
    expect(budget.percent).toBe(90);
    expect(budget.status).toBe('warning');
    expect(budget.window).toEqual({ from: '2026-08-01', to: '2026-08-31' });

    const duplicated = await api('/api/budgets', {
      method: 'POST',
      body: JSON.stringify({ category: 'Lazer', limitCents: 10_000, months: 1 }),
    });
    expect(duplicated.status).toBe(409);

    const invalid = await api('/api/budgets', {
      method: 'POST',
      body: JSON.stringify({ category: 'Lazer', limitCents: 0, months: 1 }),
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.message).toBe('Informe um limite maior que zero.');

    expect((await api(`/api/budgets/${created.body.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api('/api/budgets')).body.items).toHaveLength(0);
  });

  it('recusa apagar tudo sem a confirmação explícita', async () => {
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(newExpense) });

    for (const payload of ['{}', JSON.stringify({ confirm: 'sim' })]) {
      const { status, body } = await api('/api/data', { method: 'DELETE', body: payload });
      expect(status).toBe(422);
      expect(body.error.message).toMatch(/RESETAR/);
    }
    // Nada foi apagado.
    expect((await api('/api/transactions')).body.total).toBeGreaterThan(0);
  });

  // Deixado por último de propósito: este teste zera o banco compartilhado.
  it('apaga transações, contas e configurações quando confirmado', async () => {
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(newExpense) });
    await api('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Carteira', balanceCents: 5_000 }),
    });
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ initialBalanceCents: 700_000 }),
    });

    const { status, body } = await api('/api/data', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'RESETAR' }),
    });

    expect(status).toBe(200);
    expect(body.deletedTransactions).toBeGreaterThan(0);
    expect(body.deletedAccounts).toBeGreaterThan(0);

    expect((await api('/api/transactions')).body.total).toBe(0);
    expect((await api('/api/accounts')).body.items).toHaveLength(0);
    expect((await api('/api/settings')).body.initialBalanceCents).toBe(0);
    expect((await api('/api/summary?period=month')).body.currentBalanceCents).toBe(0);
  });
});
