/**
 * `transfer` move dinheiro entre contas próprias: não é receita nem despesa, e
 * por isso fica de fora de todo total, comparativo e limite de gasto. Ela só
 * altera o saldo de cada conta.
 */
export type TransactionType = 'income' | 'expense' | 'transfer';

/** Os tipos que representam dinheiro entrando ou saindo do seu bolso. */
export type CashflowType = 'income' | 'expense';

/** Categoria fixa das transferências — o usuário não escolhe. */
export const TRANSFER_CATEGORY = 'Transferência';

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
  /** Conta vinculada, quando o modo de múltiplas contas está em uso. */
  accountId: string | null;
  /** Nome da conta no momento da consulta — conveniência para a interface. */
  accountName: string | null;
  /** Conta de destino de uma transferência. `null` nos demais tipos. */
  transferAccountId: string | null;
  transferAccountName: string | null;
  /** Recorrência que gerou o lançamento; `null` quando foi digitado à mão. */
  recurrenceId: string | null;
  /** Compra parcelada: identificador do grupo e a posição desta parcela nele. */
  installmentGroup: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
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
  accountId?: string | null;
  /** Obrigatório nas transferências, proibido nos outros tipos. */
  transferAccountId?: string | null;
  /** Uso interno: só a materialização de recorrências preenche este campo. */
  recurrenceId?: string | null;
}

/**
 * Uma compra dividida em parcelas mensais. O valor informado pode ser o total
 * da compra ou o de cada parcela — `amountIs` diz qual.
 */
export interface InstallmentInput extends TransactionInput {
  installments: number;
  amountIs: 'total' | 'installment';
}

export interface TransactionFilters {
  search?: string;
  category?: string;
  type?: TransactionType;
  accountId?: string;
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

/** Um agrupamento nomeado de dinheiro: um banco, uma carteira, um cofrinho. */
export interface Account {
  id: string;
  name: string;
  /** Quanto havia na conta antes do histórico — é o que o usuário digita. */
  balanceCents: number;
  /**
   * Saldo de hoje: o inicial mais tudo que entrou, saiu e foi transferido.
   * Derivado das transações, nunca digitado.
   */
  currentBalanceCents: number;
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
  /**
   * O que as recorrências ainda vão lançar neste bucket. É apenas ilustrativo:
   * não entra em saldo, totais, categorias nem em nenhum outro número do app —
   * existe só para o gráfico de barras desenhar o que está por vir.
   */
  pendingIncomeCents: number;
  pendingExpenseCents: number;
}

export interface CategorySlice {
  category: string;
  totalCents: number;
  /** Participação no total do tipo, de 0 a 100, com 1 casa decimal. */
  percent: number;
  count: number;
}

export interface PeriodTotals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

/** Mesma janela, deslocada um período para trás. `null` no período "Tudo". */
export interface Comparison {
  range: DateRange;
  totals: PeriodTotals;
  /** Variação percentual em relação ao período anterior; `null` se ele foi zero. */
  incomeChangePercent: number | null;
  expenseChangePercent: number | null;
}

export interface Statistics {
  range: DateRange & { granularity: Granularity };
  totals: PeriodTotals;
  comparison: Comparison | null;
  openingBalanceCents: number;
  series: SeriesPoint[];
  expensesByCategory: CategorySlice[];
  incomeByCategory: CategorySlice[];
}

export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

/** A partir deste consumo o app avisa o usuário. */
export const BUDGET_WARNING_PERCENT = 90;

export interface Budget {
  id: string;
  category: string;
  limitCents: number;
  /** Tamanho da janela do limite, em meses (1 = mensal). */
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
  /** Janela avaliada, terminando no mês de referência. */
  window: { from: string; to: string };
  spentCents: number;
  remainingCents: number;
  /** Consumo em %, com 1 casa decimal. Pode passar de 100. */
  percent: number;
  status: BudgetStatus;
}

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly';

/**
 * Molde de uma transação que se repete. Quando a data chega, o app materializa
 * a regra: cria uma transação normal, que dali em diante vive por conta própria
 * (pode ser editada ou apagada sem afetar a regra).
 */
export interface Recurrence {
  id: string;
  /** Transferência não se repete por regra — só entrada e saída. */
  type: CashflowType;
  amountCents: number;
  description: string;
  category: string;
  accountId: string | null;
  frequency: RecurrenceFrequency;
  /** Dia do mês (1–31) das regras mensais e anuais. Meses curtos usam o último dia. */
  dayOfMonth: number;
  /** 0 = domingo … 6 = sábado. Só vale para regras semanais. */
  weekday: number;
  /** Mês (1–12) das regras anuais. */
  month: number;
  /** Primeira data em que a regra pode cair. */
  startDate: string;
  /** Última data em que a regra pode cair; `null` significa "sem fim". */
  endDate: string | null;
  /** Pausada, a regra não lança nada — nem retroage ao ser reativada. */
  active: boolean;
  /** Até que data a regra já foi considerada. `null` enquanto nunca rodou. */
  lastRunDate: string | null;
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
  /** Campos do calendário; os que o cliente omitir são deduzidos de `startDate`. */
  dayOfMonth?: number;
  weekday?: number;
  month?: number;
  startDate: string;
  endDate?: string | null;
  active?: boolean;
}

export interface RecurrenceView extends Recurrence {
  /** Nome da conta vinculada, resolvido por junção. */
  accountName: string | null;
  /** Próxima data que ainda será lançada; `null` se a regra já acabou. */
  nextDate: string | null;
}
