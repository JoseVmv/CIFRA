import type {
  Account,
  AccountInput,
  AccountsResponse,
  Budget,
  BudgetInput,
  BudgetUsage,
  CategoriesResponse,
  Category,
  CategoryInput,
  InstallmentInput,
  Paginated,
  PeriodKey,
  Recurrence,
  RecurrenceInput,
  Settings,
  SettingsInput,
  Statistics,
  Summary,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '../types/api';

const BASE_URL = '/api';

/** Maior página que a API aceita, e um teto de segurança contra laço infinito. */
const EXPORT_PAGE_SIZE = 500;
const MAX_EXPORT_PAGES = 40;

/** Palavra que o usuário digita — e que a API exige — para apagar tudo. */
export const RESET_CONFIRMATION = 'RESETAR';

/** Erro com mensagem já pronta para exibir ao usuário. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * As duas mensagens que nascem aqui, e não no servidor: falha de rede e um erro
 * sem mensagem própria. Ficam em estado de módulo pelo mesmo motivo do locale em
 * `format.ts` — `request` não é um componente e não tem como ler um contexto.
 * As demais mensagens de erro vêm prontas do backend.
 */
export const messages = {
  offline: 'Não foi possível falar com o servidor. Verifique se o backend está rodando.',
  generic: 'Algo deu errado. Tente novamente.',
};

export function setApiMessages(next: { offline: string; generic: string }): void {
  messages.offline = next.offline;
  messages.generic = next.generic;
}

function buildQuery(params: object | undefined): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
    });
  } catch (error) {
    console.error('[api] falha de rede', path, error);
    throw new ApiError(0, 'NETWORK_ERROR', messages.offline);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    console.error('[api] erro', response.status, path, payload);
    throw new ApiError(response.status, error?.code ?? 'UNKNOWN', error?.message ?? messages.generic);
  }

  return payload as T;
}

export const api = {
  listTransactions: (query?: TransactionQuery) =>
    request<Paginated<Transaction>>(`/transactions${buildQuery(query)}`),

  /**
   * Todas as transações do filtro, virando as páginas da API até o fim.
   * Usada só na exportação — as telas paginam de propósito.
   */
  async listAllTransactions(query?: TransactionQuery): Promise<Transaction[]> {
    const items: Transaction[] = [];

    for (let page = 0; page < MAX_EXPORT_PAGES; page += 1) {
      const response = await request<Paginated<Transaction>>(
        `/transactions${buildQuery({ ...query, limit: EXPORT_PAGE_SIZE, offset: page * EXPORT_PAGE_SIZE })}`,
      );
      items.push(...response.items);
      if (response.items.length === 0 || items.length >= response.total) break;
    }

    return items;
  },

  createTransaction: (input: TransactionInput) =>
    request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(input) }),

  /** Cria a compra parcelada inteira: uma transação por mês. */
  createInstallments: (input: InstallmentInput) =>
    request<{ items: Transaction[] }>('/transactions/installments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateTransaction: (id: string, input: TransactionInput) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteTransaction: (id: string) =>
    request<void>(`/transactions/${id}`, { method: 'DELETE' }),

  /** Apaga a compra parcelada inteira; devolve quantas parcelas sumiram. */
  deleteInstallmentGroup: (id: string) =>
    request<{ deleted: number }>(`/transactions/${id}?scope=installments`, { method: 'DELETE' }),

  getSummary: (period: PeriodKey, reference?: string) =>
    request<Summary>(`/summary${buildQuery({ period, reference })}`),

  getStatistics: (period: PeriodKey, reference?: string) =>
    request<Statistics>(`/statistics${buildQuery({ period, reference })}`),

  listBudgets: (reference?: string) =>
    request<{ items: BudgetUsage[] }>(`/budgets${buildQuery({ reference })}`),

  createBudget: (input: BudgetInput) =>
    request<Budget>('/budgets', { method: 'POST', body: JSON.stringify(input) }),

  updateBudget: (id: string, input: BudgetInput) =>
    request<Budget>(`/budgets/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteBudget: (id: string) => request<void>(`/budgets/${id}`, { method: 'DELETE' }),

  listRecurrences: () => request<{ items: Recurrence[] }>('/recurrences'),

  createRecurrence: (input: RecurrenceInput) =>
    request<Recurrence>('/recurrences', { method: 'POST', body: JSON.stringify(input) }),

  updateRecurrence: (id: string, input: RecurrenceInput) =>
    request<Recurrence>(`/recurrences/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  /** Remove só a regra: os lançamentos que ela já criou continuam no histórico. */
  deleteRecurrence: (id: string) => request<void>(`/recurrences/${id}`, { method: 'DELETE' }),

  getSettings: () => request<Settings>('/settings'),

  updateSettings: (input: SettingsInput) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(input) }),

  getCategories: () => request<CategoriesResponse>('/categories'),

  createCategory: (input: CategoryInput) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(input) }),

  /** Só o nome muda — e ele muda em todo o histórico junto, no servidor. */
  renameCategory: (id: string, name: string) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  /**
   * `reassignTo` é obrigatório quando a categoria ainda classifica algo: sem
   * ele a API responde 409 em vez de deixar lançamentos órfãos.
   */
  deleteCategory: (id: string, reassignTo?: string) =>
    request<void>(`/categories/${id}${buildQuery({ reassignTo })}`, { method: 'DELETE' }),

  listAccounts: () => request<AccountsResponse>('/accounts'),

  createAccount: (input: AccountInput) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify(input) }),

  updateAccount: (id: string, input: AccountInput) =>
    request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteAccount: (id: string) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),

  /** Apaga transações, categorias e configurações. Irreversível — confirme antes. */
  resetAllData: () =>
    request<{ deletedTransactions: number; clearedSettings: boolean }>('/data', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: RESET_CONFIRMATION }),
    }),
};
