import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { RecurrenceDialog } from './RecurrenceDialog';
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
      listAccounts: vi.fn(),
      createRecurrence: vi.fn(),
      updateRecurrence: vi.fn(),
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
    expense: ['Alimentação', 'Moradia'],
  });
  mockedApi.listAccounts.mockResolvedValue({ items: [], totalCents: 0 });
});

describe('diálogo de recorrência', () => {
  it('envia valor em centavos e o calendário escolhido', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockedApi.createRecurrence.mockResolvedValue({} as never);

    renderDialog(<RecurrenceDialog open onClose={onClose} recurrence={null} />);

    await user.type(screen.getByLabelText('Valor'), '480000');
    await user.type(screen.getByLabelText('Descrição'), 'Salário');
    await user.selectOptions(await screen.findByLabelText('Categoria'), 'Salário');
    await user.selectOptions(screen.getByLabelText('Dia do mês'), '5');
    await user.click(screen.getByRole('button', { name: 'Criar recorrência' }));

    await waitFor(() => expect(mockedApi.createRecurrence).toHaveBeenCalledTimes(1));
    expect(mockedApi.createRecurrence).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'income',
        amountCents: 480_000,
        description: 'Salário',
        category: 'Salário',
        frequency: 'monthly',
        dayOfMonth: 5,
        endDate: null,
        active: true,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('troca o campo de calendário conforme a frequência', async () => {
    const user = userEvent.setup();
    renderDialog(<RecurrenceDialog open onClose={() => {}} recurrence={null} />);

    expect(screen.getByLabelText('Dia do mês')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Com que frequência'), 'weekly');

    expect(screen.getByLabelText('Dia da semana')).toBeTruthy();
    expect(screen.queryByLabelText('Dia do mês')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Com que frequência'), 'yearly');

    expect(screen.getByLabelText('Mês')).toBeTruthy();
    expect(screen.getByLabelText('Dia do mês')).toBeTruthy();
  });

  it('bloqueia o envio e explica o que falta', async () => {
    const user = userEvent.setup();
    renderDialog(<RecurrenceDialog open onClose={() => {}} recurrence={null} />);

    await user.click(screen.getByRole('button', { name: 'Criar recorrência' }));

    expect(await screen.findByText('Informe um valor maior que zero.')).toBeTruthy();
    expect(screen.getByText('Descreva o lançamento.')).toBeTruthy();
    expect(mockedApi.createRecurrence).not.toHaveBeenCalled();
  });

  it('recusa data final anterior ao início', async () => {
    const user = userEvent.setup();
    renderDialog(<RecurrenceDialog open onClose={() => {}} recurrence={null} />);

    await user.type(screen.getByLabelText('Valor'), '10000');
    await user.type(screen.getByLabelText('Descrição'), 'Aluguel');
    await user.selectOptions(await screen.findByLabelText('Categoria'), 'Salário');
    await user.clear(screen.getByLabelText('Começa em'));
    await user.type(screen.getByLabelText('Começa em'), '2026-08-10');
    await user.type(screen.getByLabelText('Termina em'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Criar recorrência' }));

    expect(await screen.findByText('A data final precisa vir depois do início.')).toBeTruthy();
    expect(mockedApi.createRecurrence).not.toHaveBeenCalled();
  });
});
