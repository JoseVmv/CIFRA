/** Espelho dos tipos que a API devolve. Valores monetários sempre em centavos. */

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  type: TransactionType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Agrupamento nomeado com saldo — por enquanto serve só para compor o saldo inicial. */
export interface Account {
  id: string;
  name: string;
  balanceCents: number;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountInput {
  name: string;
  balanceCents: number;
}

export interface Settings {
  /** Saldo inicial efetivo: soma das contas, ou o valor digitado. */
  initialBalanceCents: number;
  manualInitialBalanceCents: number;
  useMultipleAccounts: boolean;
  accountsTotalCents: number;
  displayName: string;
  currency: string;
  updatedAt: string;
}

export interface SettingsInput {
  initialBalanceCents?: number;
  useMultipleAccounts?: boolean;
  displayName?: string;
}

export type PeriodKey = 'month' | '3m' | '6m' | 'year' | 'all';

export interface DateRange {
  /** `null` nos dois lados é o período "Tudo". */
  from: string | null;
  to: string | null;
  period: PeriodKey | 'custom';
}

export interface Summary {
  range: DateRange;
  currentBalanceCents: number;
  initialBalanceCents: number;
  openingBalanceCents: number;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  transactionCount: number;
}

export type Granularity = 'day' | 'month';

export interface SeriesPoint {
  bucket: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

export interface CategorySlice {
  category: string;
  totalCents: number;
  percent: number;
  count: number;
}

export interface Statistics {
  range: DateRange & { granularity: Granularity };
  totals: { incomeCents: number; expenseCents: number; netCents: number };
  openingBalanceCents: number;
  series: SeriesPoint[];
  expensesByCategory: CategorySlice[];
  incomeByCategory: CategorySlice[];
}

export interface CategoriesResponse {
  income: string[];
  expense: string[];
}

export interface TransactionQuery {
  search?: string;
  category?: string;
  type?: TransactionType;
  period?: PeriodKey;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
