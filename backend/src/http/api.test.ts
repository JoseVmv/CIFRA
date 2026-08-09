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

    const summary = await api('/api/summary?period=30d');
    expect(summary.status).toBe(200);
    expect(summary.body.currentBalanceCents).toBe(1_240_000);
    expect(summary.body.incomeCents).toBe(240_000);

    await api(`/api/transactions/${income.body.id}`, { method: 'DELETE' });
    const afterDelete = await api('/api/summary?period=30d');
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

  it('entrega estatísticas prontas para o gráfico', async () => {
    const { status, body } = await api('/api/statistics?period=30d');
    expect(status).toBe(200);
    expect(body.series).toHaveLength(30);
    expect(body.range.granularity).toBe('day');
    expect(Array.isArray(body.expensesByCategory)).toBe(true);
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
  it('apaga transações e configurações quando confirmado', async () => {
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(newExpense) });
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

    expect((await api('/api/transactions')).body.total).toBe(0);
    expect((await api('/api/settings')).body.initialBalanceCents).toBe(0);
    expect((await api('/api/summary?period=30d')).body.currentBalanceCents).toBe(0);
  });
});
