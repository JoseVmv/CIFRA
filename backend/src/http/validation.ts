import { z } from 'zod';
import { isValidIsoDate } from '../domain/dates';
import { PERIOD_KEYS } from '../domain/period';
import { CURRENCIES, LANGUAGES } from '../domain/types';
import { RESET_CONFIRMATION } from '../services/maintenance.service';
import { MAX_INSTALLMENTS } from '../services/transactions.service';
import { ValidationError } from '../errors';

/** R$ 1 bilhão em centavos — teto defensivo contra digitação acidental. */
export const MAX_AMOUNT_CENTS = 100_000_000_000;
export const MAX_DESCRIPTION_LENGTH = 140;
export const MAX_CATEGORY_LENGTH = 40;
export const MAX_ACCOUNT_NAME_LENGTH = 40;
export const MAX_NAME_LENGTH = 60;
/** Dois anos é o teto de uma janela de limite de gasto. */
export const MAX_BUDGET_MONTHS = 24;

const MIN_DATE = '1900-01-01';
const MAX_DATE = '2100-12-31';

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => isValidIsoDate(value), 'invalid_date')
  .refine((value) => value >= MIN_DATE && value <= MAX_DATE, 'date_out_of_range');

export const transactionBodySchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z
    .number()
    .int()
    .positive()
    .max(MAX_AMOUNT_CENTS),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
  category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH),
  date: isoDateSchema,
  accountId: z.string().trim().min(1).max(64).nullish(),
  /** Só as transferências usam; o serviço recusa nos outros tipos. */
  transferAccountId: z.string().trim().min(1).max(64).nullish(),
});

/** Compra parcelada: a transação-modelo mais em quantas vezes ela se divide. */
export const installmentBodySchema = transactionBodySchema.extend({
  installments: z.number().int().min(2).max(MAX_INSTALLMENTS),
  amountIs: z.enum(['total', 'installment']),
});

export const budgetBodySchema = z.object({
  category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH),
  limitCents: z.number().int().positive().max(MAX_AMOUNT_CENTS),
  months: z.number().int().min(1).max(MAX_BUDGET_MONTHS),
});

/**
 * Recorrência. Os campos de calendário são opcionais: o que não vier é deduzido
 * da data de início pelo serviço.
 */
export const recurrenceBodySchema = z
  .object({
    type: z.enum(['income', 'expense']),
    amountCents: z.number().int().positive().max(MAX_AMOUNT_CENTS),
    description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
    category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH),
    accountId: z.string().trim().min(1).max(64).nullish(),
    frequency: z.enum(['weekly', 'monthly', 'yearly']),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    month: z.number().int().min(1).max(12).optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullish(),
    active: z.boolean().optional(),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'end_before_start',
  });

const categoryNameSchema = z.string().trim().min(1).max(MAX_CATEGORY_LENGTH);

export const categoryBodySchema = z.object({
  name: categoryNameSchema,
  type: z.enum(['income', 'expense']),
});

export const categoryRenameSchema = z.object({ name: categoryNameSchema });

/** Destino opcional dos lançamentos ao apagar uma categoria em uso. */
export const categoryDeleteQuerySchema = z.object({
  reassignTo: categoryNameSchema.optional(),
});

const balanceCentsSchema = z.number().int().min(-MAX_AMOUNT_CENTS).max(MAX_AMOUNT_CENTS);

export const settingsBodySchema = z
  .object({
    initialBalanceCents: balanceCentsSchema.optional(),
    useMultipleAccounts: z.boolean().optional(),
    displayName: z.string().trim().max(MAX_NAME_LENGTH).optional(),
    currency: z.enum(CURRENCIES).optional(),
    language: z.enum(LANGUAGES).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'empty_update');

export const accountBodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_ACCOUNT_NAME_LENGTH),
  balanceCents: balanceCentsSchema,
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(MAX_CATEGORY_LENGTH).optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  accountId: z.string().trim().max(64).optional(),
  period: z.enum(PERIOD_KEYS as unknown as [string, ...string[]]).optional(),
  /** Mês em torno do qual o período é calculado — é o que permite navegar. */
  reference: isoDateSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const rangeQuerySchema = listQuerySchema.pick({
  period: true,
  reference: true,
  from: true,
  to: true,
});

export const referenceQuerySchema = listQuerySchema.pick({ reference: true });

export const idParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

/** Alcance de um DELETE: só o registro (padrão) ou a compra parcelada inteira. */
export const deleteQuerySchema = z.object({
  scope: z.enum(['installments']).optional(),
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
  type: 'Escolha se a transação é uma entrada, uma saída ou uma transferência.',
  transferAccountId: 'Escolha a conta de destino da transferência.',
  installments: `Escolha de 2 a ${MAX_INSTALLMENTS} parcelas.`,
  amountIs: 'Diga se o valor informado é o total ou o de cada parcela.',
  amountCents: 'Informe um valor maior que zero.',
  description: `A descrição é obrigatória e deve ter até ${MAX_DESCRIPTION_LENGTH} caracteres.`,
  category: 'Escolha uma categoria válida.',
  date: 'Informe uma data válida.',
  from: 'Data inicial inválida.',
  to: 'Data final inválida.',
  period: 'Período inválido.',
  reference: 'Mês de referência inválido.',
  accountId: 'Conta inválida.',
  limitCents: 'Informe um limite maior que zero.',
  months: `Escolha um período entre 1 e ${MAX_BUDGET_MONTHS} meses.`,
  frequency: 'Escolha se a recorrência é semanal, mensal ou anual.',
  dayOfMonth: 'Escolha um dia do mês entre 1 e 31.',
  weekday: 'Escolha um dia da semana.',
  month: 'Escolha um mês válido.',
  startDate: 'Informe a data em que a recorrência começa.',
  endDate: 'A data final precisa ser igual ou posterior à data de início.',
  active: 'Opção de recorrência ativa inválida.',
  limit: 'Quantidade de itens inválida.',
  offset: 'Paginação inválida.',
  initialBalanceCents: 'Informe um saldo inicial válido.',
  useMultipleAccounts: 'Opção de múltiplas contas inválida.',
  displayName: `Use no máximo ${MAX_NAME_LENGTH} caracteres no nome.`,
  name: `Dê um nome à conta, com até ${MAX_ACCOUNT_NAME_LENGTH} caracteres.`,
  balanceCents: 'Informe um saldo válido para a conta.',
  currency: 'Moeda inválida.',
  language: 'Idioma inválido.',
  reassignTo: 'Escolha uma categoria de destino válida.',
  search: 'Busca muito longa.',
  id: 'Identificador inválido.',
  confirm: `Para apagar tudo, confirme enviando "${RESET_CONFIRMATION}".`,
};

function toFriendlyMessage(issues: z.core.$ZodIssue[], overrides?: FieldMessages): string {
  const field = issues[0]?.path?.[0];
  if (typeof field === 'string') {
    const message = overrides?.[field] ?? FIELD_MESSAGES[field];
    if (message) return message;
  }
  return 'Não foi possível validar os dados enviados.';
}

type FieldMessages = Record<string, string>;

/**
 * Valida e devolve os dados já tipados, ou lança um 422 com detalhes.
 *
 * `overrides` existe porque o mesmo nome de campo aparece em recursos
 * diferentes — `name` é conta e é categoria — e a mensagem certa depende de
 * quem está validando.
 */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  overrides?: FieldMessages,
): z.infer<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(corpo)',
      code: issue.code,
    }));
    throw new ValidationError(toFriendlyMessage(result.error.issues, overrides), issues);
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
