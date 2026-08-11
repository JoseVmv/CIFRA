import type { CashflowType } from './types';

/**
 * Categorias sugeridas na interface. O usuário pode digitar outras.
 * Transferências não entram aqui: elas têm categoria própria e fixa.
 */
export const DEFAULT_CATEGORIES: Record<CashflowType, readonly string[]> = {
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
