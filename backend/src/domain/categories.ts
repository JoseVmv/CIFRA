import type { TransactionType } from './types';

/** Categorias sugeridas na interface. O usuário pode digitar outras. */
export const DEFAULT_CATEGORIES: Record<TransactionType, readonly string[]> = {
  income: ['Salário', 'Freelance', 'Investimentos', 'Vendas', 'Presente', 'Reembolso', 'Outros'],
  expense: [
    'Alimentação',
    'Transporte',
    'Moradia',
    'Faculdade',
    'Saúde',
    'Lazer',
    'Compras',
    'Assinaturas',
    'Outros',
  ],
} as const;
