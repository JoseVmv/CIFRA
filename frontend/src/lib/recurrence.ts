import type { Recurrence, RecurrenceFrequency, RecurrenceInput } from '../types/api';

/** Domingo primeiro, como nos calendários em português. */
export const WEEKDAYS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'domingo' },
  { value: 1, label: 'segunda-feira' },
  { value: 2, label: 'terça-feira' },
  { value: 3, label: 'quarta-feira' },
  { value: 4, label: 'quinta-feira' },
  { value: 5, label: 'sexta-feira' },
  { value: 6, label: 'sábado' },
];

export const MONTHS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'janeiro' },
  { value: 2, label: 'fevereiro' },
  { value: 3, label: 'março' },
  { value: 4, label: 'abril' },
  { value: 5, label: 'maio' },
  { value: 6, label: 'junho' },
  { value: 7, label: 'julho' },
  { value: 8, label: 'agosto' },
  { value: 9, label: 'setembro' },
  { value: 10, label: 'outubro' },
  { value: 11, label: 'novembro' },
  { value: 12, label: 'dezembro' },
];

export const FREQUENCY_OPTIONS: ReadonlyArray<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'monthly', label: 'Todo mês' },
  { value: 'weekly', label: 'Toda semana' },
  { value: 'yearly', label: 'Todo ano' },
];

function nameOf(list: ReadonlyArray<{ value: number; label: string }>, value: number): string {
  return list.find((item) => item.value === value)?.label ?? '';
}

/** Só os campos que a API aceita de volta — o resto da regra é leitura. */
export function toRecurrenceInput(rule: Recurrence): RecurrenceInput {
  return {
    type: rule.type,
    amountCents: rule.amountCents,
    description: rule.description,
    category: rule.category,
    accountId: rule.accountId,
    frequency: rule.frequency,
    dayOfMonth: rule.dayOfMonth,
    weekday: rule.weekday,
    month: rule.month,
    startDate: rule.startDate,
    endDate: rule.endDate,
    active: rule.active,
  };
}

/** "Todo dia 5", "Toda segunda-feira", "Todo 10 de março". */
export function describeSchedule(
  rule: Pick<Recurrence, 'frequency' | 'dayOfMonth' | 'weekday' | 'month'>,
): string {
  if (rule.frequency === 'weekly') return `Toda ${nameOf(WEEKDAYS, rule.weekday)}`;
  if (rule.frequency === 'yearly') {
    return `Todo ${rule.dayOfMonth} de ${nameOf(MONTHS, rule.month)}`;
  }
  return `Todo dia ${rule.dayOfMonth}`;
}
