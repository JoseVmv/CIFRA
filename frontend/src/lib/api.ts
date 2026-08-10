import type {
  Account,
  AccountInput,
  CategoriesResponse,
  Paginated,
  PeriodKey,
  Settings,
  SettingsInput,
  Statistics,
  Summary,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '../types/api';

const BASE_URL = '/api';

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

const OFFLINE_MESSAGE =
  'Não foi possível falar com o servidor. Verifique se o backend está rodando.';

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
    throw new ApiError(0, 'NETWORK_ERROR', OFFLINE_MESSAGE);
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
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Algo deu errado. Tente novamente.',
    );
  }

  return payload as T;
}

export const api = {
  listTransactions: (query?: TransactionQuery) =>
    request<Paginated<Transaction>>(`/transactions${buildQuery(query)}`),

  createTransaction: (input: TransactionInput) =>
    request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(input) }),

  updateTransaction: (id: string, input: TransactionInput) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteTransaction: (id: string) =>
    request<void>(`/transactions/${id}`, { method: 'DELETE' }),

  getSummary: (period: PeriodKey) => request<Summary>(`/summary${buildQuery({ period })}`),

  getStatistics: (period: PeriodKey) =>
    request<Statistics>(`/statistics${buildQuery({ period })}`),

  getSettings: () => request<Settings>('/settings'),

  updateSettings: (input: SettingsInput) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(input) }),

  getCategories: () => request<CategoriesResponse>('/categories'),

  listAccounts: () => request<{ items: Account[]; totalCents: number }>('/accounts'),

  createAccount: (input: AccountInput) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify(input) }),

  updateAccount: (id: string, input: AccountInput) =>
    request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteAccount: (id: string) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),

  /** Apaga transações e configurações. Irreversível — sempre confirme antes. */
  resetAllData: () =>
    request<{ deletedTransactions: number; clearedSettings: boolean }>('/data', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: RESET_CONFIRMATION }),
    }),
};
