/**
 * Monta um app de demonstração completo: contas, histórico de vários meses,
 * recorrências, uma compra parcelada, transferências e limites de gasto.
 *
 * A demonstração passa pelos mesmos serviços que a interface usa — nada é
 * inserido "por baixo". É por isso que os lançamentos do salário aparecem
 * marcados como recorrentes e as parcelas saem numeradas: quem os criou foi o
 * próprio app.
 *
 * Usado apenas pelo `npm run seed`. Nada disso entra no app em uso normal.
 */
import { addMonths, eachDay, startOfMonth, today } from '../domain/dates';
import type { Services } from '../services';

/** PRNG determinística: o mesmo seed sempre gera a mesma demonstração. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Quantos meses de história a demonstração cobre, contando o atual. */
const MONTHS_OF_HISTORY = 7;

/**
 * As contas nascem zeradas e o saldo inicial é calculado no fim, de trás para
 * frente, para cada uma terminar no valor de `alvo`. Assim a demonstração fica
 * apresentável sem depender da sorte dos números aleatórios.
 */
const ACCOUNTS = [
  { name: 'Nubank', alvoCents: 348_000 },
  { name: 'Itaú', alvoCents: 1_275_000 },
  { name: 'Carteira', alvoCents: 24_000 },
] as const;

/** Piso do saldo inicial, para nenhuma conta começar no vermelho. */
const MIN_INITIAL_CENTS = 5_000;

interface ExpenseTemplate {
  description: string;
  category: string;
  min: number;
  max: number;
  weight: number;
  /** Índice da conta que costuma pagar por isso. */
  account: number;
}

const EXPENSE_TEMPLATES: ExpenseTemplate[] = [
  { description: 'Mercado', category: 'Alimentação', min: 4_500, max: 18_000, weight: 5, account: 0 },
  { description: 'Almoço', category: 'Alimentação', min: 1_800, max: 4_500, weight: 7, account: 2 },
  { description: 'Café', category: 'Alimentação', min: 800, max: 2_200, weight: 5, account: 2 },
  { description: 'Padaria', category: 'Alimentação', min: 900, max: 3_400, weight: 3, account: 2 },
  { description: 'Combustível', category: 'Transporte', min: 8_000, max: 22_000, weight: 3, account: 0 },
  { description: 'Aplicativo de transporte', category: 'Transporte', min: 1_500, max: 4_800, weight: 4, account: 0 },
  { description: 'Farmácia', category: 'Saúde', min: 2_500, max: 12_000, weight: 2, account: 0 },
  { description: 'Cinema', category: 'Lazer', min: 3_000, max: 9_000, weight: 2, account: 0 },
  { description: 'Bar com amigos', category: 'Lazer', min: 4_000, max: 14_000, weight: 3, account: 0 },
  { description: 'Livraria', category: 'Lazer', min: 3_500, max: 11_000, weight: 1, account: 0 },
  { description: 'Roupas', category: 'Compras', min: 7_000, max: 30_000, weight: 2, account: 0 },
  { description: 'Presente', category: 'Compras', min: 4_000, max: 20_000, weight: 1, account: 0 },
  { description: 'Material de estudo', category: 'Faculdade', min: 3_000, max: 15_000, weight: 2, account: 0 },
];

/** Contas fixas que não valem uma regra de recorrência — variam de mês a mês. */
const MONTHLY_BILLS = [
  { day: 12, description: 'Internet', category: 'Moradia', cents: 9_990, jitter: 0 },
  { day: 8, description: 'Mensalidade da faculdade', category: 'Faculdade', cents: 89_000, jitter: 0 },
  { day: 20, description: 'Academia', category: 'Saúde', cents: 12_990, jitter: 0 },
  { day: 18, description: 'Conta de luz', category: 'Moradia', cents: 14_000, jitter: 6_000 },
] as const;

export interface DemoSummary {
  accounts: number;
  recurrences: number;
  transactions: number;
  installments: number;
  transfers: number;
  budgets: number;
  balanceCents: number;
}

export function populateDemo(services: Services, seed = 42): DemoSummary {
  const random = createRandom(seed);
  const end = today();
  const start = startOfMonth(addMonths(end, -(MONTHS_OF_HISTORY - 1)));

  services.settings.update({ displayName: 'José', useMultipleAccounts: true });

  const accounts = ACCOUNTS.map((account) =>
    services.accounts.create({ name: account.name, balanceCents: 0 }),
  );
  const accountId = (index: number): string => {
    const account = accounts[index];
    if (!account) throw new Error(`A demonstração pediu a conta ${index}, que não existe.`);
    return account.id;
  };

  // As recorrências criam sozinhas todos os lançamentos vencidos desde o início —
  // e é justamente por isso que eles aparecem marcados como automáticos.
  const recurrences = [
    {
      type: 'income' as const,
      amountCents: 480_000,
      description: 'Salário',
      category: 'Salário',
      accountId: accountId(0),
      frequency: 'monthly' as const,
      dayOfMonth: 5,
      startDate: start,
    },
    {
      type: 'expense' as const,
      amountCents: 120_000,
      description: 'Aluguel',
      category: 'Moradia',
      accountId: accountId(0),
      frequency: 'monthly' as const,
      dayOfMonth: 10,
      startDate: start,
    },
    {
      type: 'expense' as const,
      amountCents: 3_990,
      description: 'Streaming',
      category: 'Assinaturas',
      accountId: accountId(0),
      frequency: 'monthly' as const,
      dayOfMonth: 15,
      startDate: start,
    },
  ];
  for (const recurrence of recurrences) services.recurrences.create(recurrence);

  const weighted = EXPENSE_TEMPLATES.flatMap((template) =>
    Array.from({ length: template.weight }, () => template),
  );

  const registrar = (input: Parameters<Services['transactions']['create']>[0]): void => {
    services.transactions.create(input);
  };

  for (const date of eachDay(start, end)) {
    const dayOfMonth = Number(date.slice(8, 10));

    if (dayOfMonth === 22 && random() > 0.35) {
      registrar({
        type: 'income',
        amountCents: 40_000 + Math.round(random() * 90_000),
        description: 'Projeto freelance',
        category: 'Freelance',
        date,
        accountId: accountId(0),
      });
    }

    if (dayOfMonth === 28) {
      registrar({
        type: 'income',
        amountCents: 5_000 + Math.round(random() * 25_000),
        description: 'Rendimento da reserva',
        category: 'Investimentos',
        date,
        accountId: accountId(1),
      });
    }

    for (const bill of MONTHLY_BILLS) {
      if (bill.day !== dayOfMonth) continue;
      registrar({
        type: 'expense',
        amountCents: bill.cents + Math.round(random() * bill.jitter),
        description: bill.description,
        category: bill.category,
        date,
        accountId: accountId(0),
      });
    }

    const daily = random() > 0.4 ? (random() > 0.72 ? 2 : 1) : 0;
    for (let index = 0; index < daily; index += 1) {
      const pick = weighted[Math.floor(random() * weighted.length)];
      if (!pick) continue;
      registrar({
        type: 'expense',
        amountCents: pick.min + Math.round(random() * (pick.max - pick.min)),
        description: pick.description,
        category: pick.category,
        date,
        accountId: accountId(pick.account),
      });
    }
  }

  // Uma compra parcelada que começou há cinco meses: a maior parte já passou e
  // duas parcelas ainda estão por vir — o bastante para a numeração aparecer no
  // histórico sem entulhar o topo da lista com um mesmo item repetido.
  const parcelas = services.transactions.createInstallments({
    type: 'expense',
    amountCents: 29_990,
    description: 'Câmera',
    category: 'Compras',
    date: `${addMonths(end, -5).slice(0, 8)}14`,
    accountId: accountId(0),
    installments: 8,
    amountIs: 'installment',
  });

  // Duas rotinas de quem separa dinheiro: a reserva vai para a poupança e o
  // troco do dia a dia sai para a carteira.
  let transferencias = 0;
  for (let mes = MONTHS_OF_HISTORY - 1; mes >= 0; mes -= 1) {
    const mesAtual = addMonths(end, -mes).slice(0, 8);

    services.transactions.create({
      type: 'transfer',
      amountCents: 30_000 + Math.round(random() * 20_000),
      description: 'Reserva do mês',
      category: 'Transferência',
      date: `${mesAtual}06`,
      accountId: accountId(0),
      transferAccountId: accountId(1),
    });

    services.transactions.create({
      type: 'transfer',
      amountCents: 15_000 + Math.round(random() * 10_000),
      description: 'Saque para a carteira',
      category: 'Transferência',
      date: `${mesAtual}07`,
      accountId: accountId(0),
      transferAccountId: accountId(2),
    });

    transferencias += 2;
  }

  // Com todo o movimento no lugar, o saldo inicial de cada conta é o que falta
  // para ela chegar ao alvo. Como as contas nasceram zeradas, o saldo de hoje é
  // exatamente o movimento acumulado.
  accounts.forEach((account, index) => {
    const alvo = ACCOUNTS[index]?.alvoCents ?? 0;
    const movimento = services.accounts.getById(account.id).currentBalanceCents;
    services.accounts.update(account.id, {
      name: account.name,
      balanceCents: Math.max(alvo - movimento, MIN_INITIAL_CENTS),
    });
  });

  // Os limites são calibrados pelo gasto real deste mês, para a tela mostrar os
  // três estados de uma vez: tranquilo, no limite e estourado.
  const gastoDoMes = new Map(
    services.analytics
      .getStatistics({ from: startOfMonth(end), to: end, period: 'custom' })
      .expensesByCategory.map((slice) => [slice.category, slice.totalCents]),
  );

  const budgets: Array<{ category: string; months: number; fator: number }> = [
    { category: 'Alimentação', months: 1, fator: 1.35 }, // folga
    { category: 'Transporte', months: 1, fator: 1.02 }, // no limite
    { category: 'Lazer', months: 1, fator: 0.78 }, // estourado
  ];

  let criados = 0;
  for (const budget of budgets) {
    const gasto = gastoDoMes.get(budget.category) ?? 0;
    if (gasto <= 0) continue;
    services.budgets.create({
      category: budget.category,
      limitCents: Math.max(Math.round((gasto * budget.fator) / 1000) * 1000, 1_000),
      months: budget.months,
    });
    criados += 1;
  }

  return {
    accounts: accounts.length,
    recurrences: recurrences.length,
    transactions: services.transactions.count(),
    installments: parcelas.length,
    transfers: transferencias,
    budgets: criados,
    balanceCents: services.analytics.currentBalanceCents(),
  };
}
