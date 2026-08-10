import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TransactionDialog } from './TransactionDialog';
import { FinanceProvider } from '../../context/FinanceContext';
import { ToastProvider } from '../../context/ToastContext';
import { api } from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      getSettings: vi.fn(),
      getCategories: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      listTransactions: vi.fn(),
      getSummary: vi.fn(),
      getStatistics: vi.fn(),
      updateSettings: vi.fn(),
      resetAllData: vi.fn(),
      listAccounts: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

function renderDialog(node: ReactNode) {
  return render(
    <ToastProvider>
      <FinanceProvider>{node}</FinanceProvider>
    </ToastProvider>,
  );
}

/** Valor atual de um campo de formulário, já tipado. */
function valueOf(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

beforeEach(() => {
  mockedApi.getSettings.mockResolvedValue({
    initialBalanceCents: 0,
    manualInitialBalanceCents: 0,
    useMultipleAccounts: false,
    accountsTotalCents: 0,
    displayName: '',
    currency: 'BRL',
    updatedAt: new Date().toISOString(),
  });
  mockedApi.getCategories.mockResolvedValue({
    income: ['Salário', 'Freelance'],
    expense: ['Alimentação', 'Transporte'],
  });
  mockedApi.listAccounts.mockResolvedValue({ items: [], totalCents: 0 });
});

/** Liga o modo de múltiplas contas com as contas informadas. */
function withAccounts(names: string[]): void {
  mockedApi.getSettings.mockResolvedValue({
    initialBalanceCents: 0,
    manualInitialBalanceCents: 0,
    useMultipleAccounts: true,
    accountsTotalCents: 0,
    displayName: '',
    currency: 'BRL',
    updatedAt: new Date().toISOString(),
  });
  mockedApi.listAccounts.mockResolvedValue({
    items: names.map((name, index) => ({
      id: `conta-${index}`,
      name,
      balanceCents: 0,
      position: index,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    })),
    totalCents: 0,
  });
}

describe('diálogo de transação', () => {
  it('converte o que é digitado em um valor monetário formatado', async () => {
    const user = userEvent.setup();
    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    await user.type(screen.getByLabelText('Valor'), '8000');

    expect(valueOf('Valor')).toBe('80,00');
  });

  it('bloqueia o envio e explica o que falta quando o formulário está incompleto', async () => {
    const user = userEvent.setup();
    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText('Informe um valor maior que zero.')).toBeTruthy();
    expect(screen.getByText('Descreva a transação.')).toBeTruthy();
    expect(mockedApi.createTransaction).not.toHaveBeenCalled();
  });

  it('envia a transação em centavos e fecha o diálogo', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockedApi.createTransaction.mockResolvedValue({
      id: 'abc',
      type: 'expense',
      amountCents: 8000,
      description: 'Combustível',
      category: 'Transporte',
      date: '2026-08-09',
      accountId: null,
      accountName: null,
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    });

    renderDialog(
      <TransactionDialog open onClose={onClose} transaction={null} defaultType="expense" />,
    );

    // A lista de categorias vem da API antes de podermos escolher uma.
    await waitFor(() => expect(mockedApi.getCategories).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Valor'), '8000');
    await user.type(screen.getByLabelText('Descrição'), 'Combustível');
    await user.selectOptions(await screen.findByLabelText('Categoria'), 'Transporte');

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockedApi.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        amountCents: 8000,
        description: 'Combustível',
        category: 'Transporte',
      }),
    );
    expect(await screen.findByText('Saída adicionada')).toBeTruthy();
  });

  it('mostra uma mensagem amigável quando o servidor recusa', async () => {
    const user = userEvent.setup();
    const { ApiError } = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
    mockedApi.createTransaction.mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Informe um valor maior que zero.'),
    );

    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="income" />,
    );
    await waitFor(() => expect(mockedApi.getCategories).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Valor'), '5000');
    await user.type(screen.getByLabelText('Descrição'), 'Salário');
    await user.selectOptions(await screen.findByLabelText('Categoria'), 'Salário');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Informe um valor maior que zero.');
  });

  it('não pede conta quando o modo de múltiplas contas está desligado', async () => {
    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );
    await waitFor(() => expect(mockedApi.getCategories).toHaveBeenCalled());

    expect(screen.queryByLabelText('Conta')).toBeNull();
  });

  it('exige a conta quando o modo de múltiplas contas está ligado', async () => {
    const user = userEvent.setup();
    withAccounts(['Nubank', 'Itaú']);
    mockedApi.createTransaction.mockResolvedValue({
      id: 'abc',
      type: 'expense',
      amountCents: 8000,
      description: 'Combustível',
      category: 'Transporte',
      date: '2026-08-09',
      accountId: 'conta-0',
      accountName: 'Nubank',
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    });

    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    const accountField = await screen.findByLabelText('Conta');
    await user.type(screen.getByLabelText('Valor'), '8000');
    await user.type(screen.getByLabelText('Descrição'), 'Combustível');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Transporte');

    // Sem escolher a conta, o envio é bloqueado.
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Escolha a conta desta transação.')).toBeTruthy();
    expect(mockedApi.createTransaction).not.toHaveBeenCalled();

    await user.selectOptions(accountField, 'Nubank');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mockedApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'conta-0' }),
      ),
    );
  });

  it('orienta a cadastrar contas quando o modo está ligado mas não há nenhuma', async () => {
    withAccounts([]);
    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    expect(await screen.findByText(/ainda não cadastrou nenhuma/)).toBeTruthy();
    expect(screen.queryByLabelText('Conta')).toBeNull();
  });

  it('abre já preenchido ao editar uma transação existente', async () => {
    renderDialog(
      <TransactionDialog
        open
        onClose={() => {}}
        defaultType="income"
        transaction={{
          id: 'abc',
          type: 'income',
          amountCents: 240000,
          description: 'Salário de agosto',
          category: 'Salário',
          date: '2026-08-05',
          accountId: null,
          accountName: null,
          createdAt: '2026-08-05T12:00:00.000Z',
          updatedAt: '2026-08-05T12:00:00.000Z',
        }}
      />,
    );

    expect(valueOf('Valor')).toBe('2.400,00');
    expect(valueOf('Descrição')).toBe('Salário de agosto');
    expect(valueOf('Data')).toBe('2026-08-05');
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy();
  });
});
