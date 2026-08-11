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
      createInstallments: vi.fn(),
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
  mockedApi.listAccounts.mockResolvedValue({
    items: [],
    totalCents: 0,
    currentTotalCents: 0,
    unlinkedNetCents: 0,
  });
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
      currentBalanceCents: 0,
      position: index,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    })),
    totalCents: 0,
    currentTotalCents: 0,
    unlinkedNetCents: 0,
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
      transferAccountId: null,
      transferAccountName: null,
      recurrenceId: null,
      installmentGroup: null,
      installmentNumber: null,
      installmentTotal: null,
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
      transferAccountId: null,
      transferAccountName: null,
      recurrenceId: null,
      installmentGroup: null,
      installmentNumber: null,
      installmentTotal: null,
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
          transferAccountId: null,
          transferAccountName: null,
          recurrenceId: null,
          installmentGroup: null,
          installmentNumber: null,
          installmentTotal: null,
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

describe('transferência entre contas', () => {
  it('só é oferecida quando existem duas contas', async () => {
    withAccounts(['Nubank']);
    const { unmount } = renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    await screen.findByLabelText('Conta');
    expect(screen.queryByRole('radio', { name: 'Transferência' })).toBeNull();
    unmount();

    withAccounts(['Nubank', 'Itaú']);
    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    expect(await screen.findByRole('radio', { name: 'Transferência' })).toBeTruthy();
  });

  it('troca categoria por origem e destino, e envia a categoria fixa', async () => {
    const user = userEvent.setup();
    withAccounts(['Nubank', 'Itaú']);
    mockedApi.createTransaction.mockResolvedValue({} as never);

    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    await user.click(await screen.findByRole('radio', { name: 'Transferência' }));

    // Transferência não tem categoria: quem manda são as contas.
    expect(screen.queryByLabelText('Categoria')).toBeNull();
    await user.type(screen.getByLabelText('Valor'), '50000');
    await user.type(screen.getByLabelText('Descrição'), 'Reserva');

    // Sem destino, o envio para de pé.
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Escolha a conta de origem.')).toBeTruthy();
    expect(mockedApi.createTransaction).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('De'), 'Nubank');
    await user.selectOptions(screen.getByLabelText('Para'), 'Itaú');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mockedApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer',
          amountCents: 50_000,
          category: 'Transferência',
          accountId: 'conta-0',
          transferAccountId: 'conta-1',
        }),
      ),
    );
  });

  it('não oferece a origem como destino', async () => {
    const user = userEvent.setup();
    withAccounts(['Nubank', 'Itaú']);

    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    await user.click(await screen.findByRole('radio', { name: 'Transferência' }));
    await user.selectOptions(screen.getByLabelText('De'), 'Nubank');

    const destinos = [...screen.getByLabelText('Para').querySelectorAll('option')].map(
      (option) => option.textContent,
    );
    expect(destinos).not.toContain('Nubank');
    expect(destinos).toContain('Itaú');
  });
});

describe('compra parcelada', () => {
  it('mostra como as parcelas ficam e cria todas de uma vez', async () => {
    const user = userEvent.setup();
    mockedApi.createInstallments.mockResolvedValue({ items: new Array(3).fill({}) } as never);

    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    await user.type(screen.getByLabelText('Valor'), '100000');
    await user.type(screen.getByLabelText('Descrição'), 'Câmera');
    await user.selectOptions(await screen.findByLabelText('Categoria'), 'Transporte');
    await user.click(screen.getByLabelText('Compra parcelada'));
    await user.selectOptions(screen.getByLabelText('Parcelas'), '3');

    // A sobra da divisão aparece na prévia, igual ao que o servidor vai gravar.
    expect(screen.getByText(/333,33/)).toBeTruthy();
    expect(screen.getByText(/333,34/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mockedApi.createInstallments).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 100_000,
          installments: 3,
          amountIs: 'total',
          description: 'Câmera',
        }),
      ),
    );
    expect(mockedApi.createTransaction).not.toHaveBeenCalled();
  });

  it('não parcela entrada nem transferência', async () => {
    const user = userEvent.setup();
    withAccounts(['Nubank', 'Itaú']);

    renderDialog(
      <TransactionDialog open onClose={() => {}} transaction={null} defaultType="expense" />,
    );

    expect(await screen.findByLabelText('Compra parcelada')).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Entrada' }));
    expect(screen.queryByLabelText('Compra parcelada')).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Transferência' }));
    expect(screen.queryByLabelText('Compra parcelada')).toBeNull();
  });
});
