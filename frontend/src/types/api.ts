/** Espelho dos tipos que a API devolve. Valores monetários sempre em centavos. */

/**
 * `transfer` move dinheiro entre contas suas: não é receita nem despesa e fica
 * fora de todo total, comparativo e limite de gasto.
 */
export type TransactionType = 'income' | 'expense' | 'transfer';

/** Os tipos que representam dinheiro entrando ou saindo do seu bolso. */
export type CashflowType = 'income' | 'expense';

/** Categoria fixa das transferências — a interface não deixa escolher outra. */
export const TRANSFER_CATEGORY = 'Transferência';

export interface Transaction {
  id: string;
  type: TransactionType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  accountId: string | null;
  accountName: string | null;
  /** Conta de destino de uma transferência. `null` nos demais tipos. */
  transferAccountId: string | null;
  transferAccountName: string | null;
  /** Recorrência que gerou o lançamento; `null` quando foi digitado à mão. */
  recurrenceId: string | null;
  /** Compra parcelada: o grupo e a posição desta parcela nele. */
  installmentGroup: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  type: TransactionType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  accountId?: string | null;
  transferAccountId?: string | null;
}

/** Uma compra dividida em parcelas mensais. */
export interface InstallmentInput extends TransactionInput {
  installments: number;
  /** O valor informado é o preço da compra ou o de cada parcela? */
  amountIs: 'total' | 'installment';
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Um agrupamento nomeado de dinheiro: um banco, uma carteira, um cofrinho. */
export interface Account {
  id: string;
  name: string;
  /** Quanto havia na conta antes do histórico — é o que o usuário digita. */
  balanceCents: number;
  /** Saldo de hoje, derivado das transações da conta. Nunca digitado. */
  currentBalanceCents: number;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsResponse {
  items: Account[];
  /** Soma dos saldos iniciais — é o saldo inicial do app no modo múltiplas contas. */
  totalCents: number;
  /** Soma dos saldos de hoje. */
  currentTotalCents: number;
  /** Resultado das transações que não estão em conta nenhuma. */
  unlinkedNetCents: number;
}

export interface AccountInput {
  name: string;
  balanceCents: number;
}

/** Idiomas em que a interface é oferecida — espelha o backend. */
export type Language = 'pt' | 'en' | 'es';

/**
 * Moedas em que os valores podem ser exibidos — espelha o backend.
 *
 * A escolha é de exibição: os centavos guardados nunca mudam, e trocar de moeda
 * não converte nada. É o mesmo número com outro símbolo.
 */
export const CURRENCIES = ['BRL', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Settings {
  /** Saldo inicial efetivo: soma das contas, ou o valor digitado. */
  initialBalanceCents: number;
  manualInitialBalanceCents: number;
  useMultipleAccounts: boolean;
  accountsTotalCents: number;
  displayName: string;
  /** Moeda em que os valores são exibidos. Não converte nada — só o símbolo. */
  currency: Currency;
  /** Idioma da interface. Fica no servidor para valer no PC e no celular. */
  language: Language;
  updatedAt: string;
}

export interface SettingsInput {
  initialBalanceCents?: number;
  useMultipleAccounts?: boolean;
  displayName?: string;
  language?: Language;
  currency?: Currency;
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
  /**
   * O que as recorrências ainda vão lançar. Só o gráfico de barras desenha esses
   * valores, como marcação pontilhada — eles não entram em nenhum número do app.
   */
  pendingIncomeCents: number;
  pendingExpenseCents: number;
}

export interface CategorySlice {
  category: string;
  totalCents: number;
  percent: number;
  count: number;
}

export interface PeriodTotals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface Comparison {
  range: DateRange;
  totals: PeriodTotals;
  incomeChangePercent: number | null;
  expenseChangePercent: number | null;
}

export interface Statistics {
  range: DateRange & { granularity: Granularity };
  totals: PeriodTotals;
  /** `null` no período "Tudo", que não tem anterior. */
  comparison: Comparison | null;
  openingBalanceCents: number;
  series: SeriesPoint[];
  expensesByCategory: CategorySlice[];
  incomeByCategory: CategorySlice[];
}

export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

/** A partir deste consumo o app avisa no painel. */
export const BUDGET_WARNING_PERCENT = 90;

export interface Budget {
  id: string;
  category: string;
  limitCents: number;
  months: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetInput {
  category: string;
  limitCents: number;
  months: number;
}

export interface BudgetUsage extends Budget {
  window: { from: string; to: string };
  spentCents: number;
  remainingCents: number;
  percent: number;
  status: BudgetStatus;
}

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly';

/** Molde de uma transação que se repete sozinha quando a data chega. */
export interface Recurrence {
  id: string;
  /** Transferência não se repete por regra — só entrada e saída. */
  type: CashflowType;
  amountCents: number;
  description: string;
  category: string;
  accountId: string | null;
  accountName: string | null;
  frequency: RecurrenceFrequency;
  /** Dia do mês das regras mensais e anuais. Meses curtos usam o último dia. */
  dayOfMonth: number;
  /** 0 = domingo … 6 = sábado. Só vale para regras semanais. */
  weekday: number;
  /** Mês (1–12) das regras anuais. */
  month: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  lastRunDate: string | null;
  /** Próximo lançamento previsto; `null` quando a regra já acabou. */
  nextDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrenceInput {
  type: CashflowType;
  amountCents: number;
  description: string;
  category: string;
  accountId?: string | null;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;
  weekday?: number;
  month?: number;
  startDate: string;
  endDate?: string | null;
  active?: boolean;
}

/**
 * Categoria criada pelo usuário. As sugeridas não têm registro: elas são
 * constantes, e a interface as traduz pelo nome canônico.
 */
export interface Category {
  id: string;
  name: string;
  type: CashflowType;
  position: number;
  /** Quantos lançamentos e recorrências usam este nome hoje. */
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  type: CashflowType;
}

export interface CategoriesResponse {
  /** Nomes canônicos prontos para os seletores: sugeridas + personalizadas. */
  income: string[];
  expense: string[];
  /** Só as personalizadas, com id — é o que a tela de ajustes gerencia. */
  custom: Category[];
}

export interface TransactionQuery {
  search?: string;
  category?: string;
  type?: TransactionType;
  accountId?: string;
  period?: PeriodKey;
  /** Mês em torno do qual o período é montado. */
  reference?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
