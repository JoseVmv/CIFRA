import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsPanel } from './AccountsPanel';
import { FinanceProvider } from '../../context/FinanceContext';
import { ToastProvider } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { Account } from '../../types/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      getSettings: vi.fn(),
      getCategories: vi.fn(),
      listAccounts: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
      listTransactions: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      getSummary: vi.fn(),
      getStatistics: vi.fn(),
      updateSettings: vi.fn(),
      resetAllData: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

function account(name: string, balanceCents: number, position: number): Account {
  return {
    id: `id-${position}`,
    name,
    balanceCents,
    position,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  };
}

const NUBANK = account('Nubank', 250_000, 0);
const ITAU = account('Itaú', 800_000, 1);

function renderPanel() {
  return render(
    <ToastProvider>
      <FinanceProvider>
        <AccountsPanel />
      </FinanceProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  mockedApi.getSettings.mockResolvedValue({
    initialBalanceCents: 1_050_000,
    manualInitialBalanceCents: 0,
    useMultipleAccounts: true,
    accountsTotalCents: 1_050_000,
    displayName: '',
    currency: 'BRL',
    updatedAt: new Date().toISOString(),
  });
  mockedApi.getCategories.mockResolvedValue({ income: [], expense: [] });
  mockedApi.listAccounts.mockResolvedValue({
    items: [NUBANK, ITAU],
    totalCents: 1_050_000,
  });
});

describe('painel de contas', () => {
  it('lista as contas e mostra a soma como saldo inicial', async () => {
    renderPanel();

    expect(await screen.findByDisplayValue('Nubank')).toBeTruthy();
    expect(screen.getByDisplayValue('Itaú')).toBeTruthy();
    expect(screen.getByDisplayValue('2.500,00')).toBeTruthy();
    expect(screen.getByDisplayValue('8.000,00')).toBeTruthy();

    const total = screen.getByText('Saldo inicial').textContent ?? '';
    expect(total.replace(/\s/g, ' ')).toContain('R$ 10.500,00');
  });

  it('explica o estado vazio quando ainda não há contas', async () => {
    mockedApi.listAccounts.mockResolvedValue({ items: [], totalCents: 0 });
    renderPanel();

    expect(await screen.findByText(/Nenhuma conta ainda/)).toBeTruthy();
  });

  it('adiciona uma conta com nome e saldo', async () => {
    const user = userEvent.setup();
    mockedApi.createAccount.mockResolvedValue(account('Carteira', 15_000, 2));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Adicionar conta' }));
    await user.type(screen.getByLabelText('Nome da nova conta'), 'Carteira');
    await user.type(screen.getByLabelText('Saldo da nova conta'), '15000');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mockedApi.createAccount).toHaveBeenCalledWith({
        name: 'Carteira',
        balanceCents: 15_000,
      }),
    );
  });

  it('não cria conta sem nome', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Adicionar conta' }));
    await user.type(screen.getByLabelText('Saldo da nova conta'), '5000');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(mockedApi.createAccount).not.toHaveBeenCalled();
  });

  it('salva a alteração de nome ao sair do campo', async () => {
    const user = userEvent.setup();
    mockedApi.updateAccount.mockResolvedValue({ ...NUBANK, name: 'Nubank Conta' });
    renderPanel();

    const field = await screen.findByDisplayValue('Nubank');
    await user.clear(field);
    await user.type(field, 'Nubank Conta');
    await user.tab();

    await waitFor(() =>
      expect(mockedApi.updateAccount).toHaveBeenCalledWith('id-0', {
        name: 'Nubank Conta',
        balanceCents: 250_000,
      }),
    );
  });

  it('não chama a API quando nada mudou', async () => {
    const user = userEvent.setup();
    renderPanel();

    const field = await screen.findByDisplayValue('Nubank');
    await user.click(field);
    await user.tab();

    expect(mockedApi.updateAccount).not.toHaveBeenCalled();
  });

  it('remove uma conta', async () => {
    const user = userEvent.setup();
    mockedApi.deleteAccount.mockResolvedValue(undefined);
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Remover conta Nubank' }));

    await waitFor(() => expect(mockedApi.deleteAccount).toHaveBeenCalledWith('id-0'));
    expect(await screen.findByText(/removida/)).toBeTruthy();
  });
});
