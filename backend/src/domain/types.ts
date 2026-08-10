export type TransactionType = 'income' | 'expense';

/** Transação no formato da API (valores monetários sempre em centavos). */
export interface Transaction {
  id: string;
  type: TransactionType;
  /** Valor absoluto em centavos. Sempre positivo — o sinal vem do `type`. */
  amountCents: number;
  description: string;
  category: string;
  /** Data da transação no calendário local, `YYYY-MM-DD`. */
  date: string;
  /** Momento em que o registro foi criado (ISO 8601, UTC). */
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

export interface TransactionFilters {
  search?: string;
  category?: string;
  type?: TransactionType;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Uma "conta" é só um agrupamento nomeado com saldo — por enquanto sem outras funções. */
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
  /**
   * Saldo inicial efetivo — o que os cálculos usam. Com múltiplas contas ativas,
   * é a soma das contas; caso contrário, é o valor digitado no campo.
   */
  initialBalanceCents: number;
  /** O valor digitado no campo, preservado mesmo com múltiplas contas ativas. */
  manualInitialBalanceCents: number;
  useMultipleAccounts: boolean;
  accountsTotalCents: number;
  displayName: string;
  currency: string;
  updatedAt: string;
}

export type PeriodKey = 'month' | '3m' | '6m' | 'year' | 'all';

export interface DateRange {
  /** `null` nos dois lados significa "sem limite" — é o período "Tudo". */
  from: string | null;
  to: string | null;
  period: PeriodKey | 'custom';
}

export interface Summary {
  range: DateRange;
  /** Saldo consolidado de toda a história: inicial + entradas − saídas. */
  currentBalanceCents: number;
  initialBalanceCents: number;
  /** Saldo no instante anterior ao início do período. */
  openingBalanceCents: number;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  transactionCount: number;
}

export type Granularity = 'day' | 'month';

export interface SeriesPoint {
  /** `YYYY-MM-DD` para granularidade diária, `YYYY-MM` para mensal. */
  bucket: string;
  incomeCents: number;
  expenseCents: number;
  /** Saldo acumulado ao final do bucket. */
  balanceCents: number;
}

export interface CategorySlice {
  category: string;
  totalCents: number;
  /** Participação no total do tipo, de 0 a 100, com 1 casa decimal. */
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
