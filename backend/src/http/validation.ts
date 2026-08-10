import { z } from 'zod';
import { isValidIsoDate } from '../domain/dates';
import { PERIOD_KEYS } from '../domain/period';
import { RESET_CONFIRMATION } from '../services/maintenance.service';
import { ValidationError } from '../errors';

/** R$ 1 bilhão em centavos — teto defensivo contra digitação acidental. */
export const MAX_AMOUNT_CENTS = 100_000_000_000;
export const MAX_DESCRIPTION_LENGTH = 140;
export const MAX_CATEGORY_LENGTH = 40;
export const MAX_ACCOUNT_NAME_LENGTH = 40;
export const MAX_NAME_LENGTH = 60;

const MIN_DATE = '1900-01-01';
const MAX_DATE = '2100-12-31';

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => isValidIsoDate(value), 'invalid_date')
  .refine((value) => value >= MIN_DATE && value <= MAX_DATE, 'date_out_of_range');

export const transactionBodySchema = z.object({
  type: z.enum(['income', 'expense']),
  amountCents: z
    .number()
    .int()
    .positive()
    .max(MAX_AMOUNT_CENTS),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
  category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH),
  date: isoDateSchema,
});

const balanceCentsSchema = z.number().int().min(-MAX_AMOUNT_CENTS).max(MAX_AMOUNT_CENTS);

export const settingsBodySchema = z
  .object({
    initialBalanceCents: balanceCentsSchema.optional(),
    useMultipleAccounts: z.boolean().optional(),
    displayName: z.string().trim().max(MAX_NAME_LENGTH).optional(),
    currency: z.string().trim().min(3).max(3).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'empty_update');

export const accountBodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_ACCOUNT_NAME_LENGTH),
  balanceCents: balanceCentsSchema,
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(MAX_CATEGORY_LENGTH).optional(),
  type: z.enum(['income', 'expense']).optional(),
  period: z.enum(PERIOD_KEYS as unknown as [string, ...string[]]).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const rangeQuerySchema = listQuerySchema.pick({ period: true, from: true, to: true });

export const idParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

/**
 * Apagar tudo é irreversível, então a intenção precisa ser explícita:
 * um `DELETE` acidental sem esse corpo não destrói nada.
 */
export const resetBodySchema = z.object({
  confirm: z.literal(RESET_CONFIRMATION),
});

/** Mensagens amigáveis por campo — o usuário nunca vê o texto cru do Zod. */
const FIELD_MESSAGES: Record<string, string> = {
  type: 'Escolha se a transação é uma entrada ou uma saída.',
  amountCents: 'Informe um valor maior que zero.',
  description: `A descrição é obrigatória e deve ter até ${MAX_DESCRIPTION_LENGTH} caracteres.`,
  category: 'Escolha uma categoria válida.',
  date: 'Informe uma data válida.',
  from: 'Data inicial inválida.',
  to: 'Data final inválida.',
  period: 'Período inválido.',
  limit: 'Quantidade de itens inválida.',
  offset: 'Paginação inválida.',
  initialBalanceCents: 'Informe um saldo inicial válido.',
  useMultipleAccounts: 'Opção de múltiplas contas inválida.',
  displayName: `Use no máximo ${MAX_NAME_LENGTH} caracteres no nome.`,
  name: `Dê um nome à conta, com até ${MAX_ACCOUNT_NAME_LENGTH} caracteres.`,
  balanceCents: 'Informe um saldo válido para a conta.',
  currency: 'Moeda inválida.',
  search: 'Busca muito longa.',
  id: 'Identificador inválido.',
  confirm: `Para apagar tudo, confirme enviando "${RESET_CONFIRMATION}".`,
};

function toFriendlyMessage(issues: z.core.$ZodIssue[]): string {
  const field = issues[0]?.path?.[0];
  if (typeof field === 'string' && FIELD_MESSAGES[field]) {
    return FIELD_MESSAGES[field];
  }
  return 'Não foi possível validar os dados enviados.';
}

/** Valida e devolve os dados já tipados, ou lança um 422 com detalhes. */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(corpo)',
      code: issue.code,
    }));
    throw new ValidationError(toFriendlyMessage(result.error.issues), issues);
  }
  return result.data;
}

/**
 * Normaliza `req.query`: strings vazias viram `undefined` e arrays (`?type=a&type=b`)
 * colapsam no primeiro valor, para o schema não precisar lidar com isso.
 */
export function normalizeQuery(query: unknown): Record<string, string> {
  const source = (query ?? {}) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value;
    }
  }
  return result;
}
