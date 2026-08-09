import { addDays, today } from '../domain/dates';
import type { TransactionInput } from '../domain/types';

/** PRNG determinística: o mesmo seed sempre gera a mesma demonstração. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const EXPENSE_TEMPLATES: Array<{
  description: string;
  category: string;
  min: number;
  max: number;
  weight: number;
}> = [
  { description: 'Mercado', category: 'Alimentação', min: 4500, max: 18000, weight: 5 },
  { description: 'Almoço', category: 'Alimentação', min: 1800, max: 4500, weight: 8 },
  { description: 'Café', category: 'Alimentação', min: 800, max: 2200, weight: 6 },
  { description: 'Combustível', category: 'Transporte', min: 8000, max: 22000, weight: 3 },
  { description: 'Aplicativo de transporte', category: 'Transporte', min: 1500, max: 4800, weight: 4 },
  { description: 'Farmácia', category: 'Saúde', min: 2500, max: 12000, weight: 2 },
  { description: 'Cinema', category: 'Lazer', min: 3000, max: 9000, weight: 2 },
  { description: 'Bar com amigos', category: 'Lazer', min: 4000, max: 14000, weight: 3 },
  { description: 'Roupas', category: 'Compras', min: 7000, max: 30000, weight: 2 },
  { description: 'Material de estudo', category: 'Faculdade', min: 3000, max: 15000, weight: 2 },
];

const FIXED_EXPENSES: Array<{ day: number; description: string; category: string; cents: number }> =
  [
    { day: 10, description: 'Aluguel', category: 'Moradia', cents: 120_000 },
    { day: 12, description: 'Internet', category: 'Moradia', cents: 9_990 },
    { day: 8, description: 'Mensalidade da faculdade', category: 'Faculdade', cents: 89_000 },
    { day: 15, description: 'Streaming', category: 'Assinaturas', cents: 3_990 },
    { day: 20, description: 'Academia', category: 'Saúde', cents: 12_990 },
  ];

/**
 * Gera transações fictícias cobrindo os últimos `days` dias.
 * Usado apenas pelo `npm run seed` — nada disso entra no app em uso normal.
 */
export function buildDemoTransactions(days = 100, seed = 42): TransactionInput[] {
  const random = createRandom(seed);
  const end = today();
  const transactions: TransactionInput[] = [];

  const weightedExpenses = EXPENSE_TEMPLATES.flatMap((template) =>
    Array.from({ length: template.weight }, () => template),
  );

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(end, -offset);
    const dayOfMonth = Number(date.slice(8, 10));

    if (dayOfMonth === 5) {
      transactions.push({
        type: 'income',
        amountCents: 320_000,
        description: 'Salário',
        category: 'Salário',
        date,
      });
    }

    if (dayOfMonth === 22 && random() > 0.35) {
      transactions.push({
        type: 'income',
        amountCents: 40_000 + Math.round(random() * 90_000),
        description: 'Projeto freelance',
        category: 'Freelance',
        date,
      });
    }

    if (dayOfMonth === 28 && random() > 0.5) {
      transactions.push({
        type: 'income',
        amountCents: 5_000 + Math.round(random() * 25_000),
        description: 'Rendimento da reserva',
        category: 'Investimentos',
        date,
      });
    }

    for (const fixed of FIXED_EXPENSES) {
      if (fixed.day === dayOfMonth) {
        transactions.push({
          type: 'expense',
          amountCents: fixed.cents,
          description: fixed.description,
          category: fixed.category,
          date,
        });
      }
    }

    const dailyCount = random() > 0.45 ? (random() > 0.75 ? 2 : 1) : 0;
    for (let index = 0; index < dailyCount; index += 1) {
      const pick = weightedExpenses[Math.floor(random() * weightedExpenses.length)];
      if (!pick) continue;
      transactions.push({
        type: 'expense',
        amountCents: pick.min + Math.round(random() * (pick.max - pick.min)),
        description: pick.description,
        category: pick.category,
        date,
      });
    }
  }

  return transactions;
}

export const DEMO_INITIAL_BALANCE_CENTS = 450_000;
