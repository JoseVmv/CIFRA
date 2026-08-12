import type { Dictionary } from '../i18n/pt';
import type { Recurrence, RecurrenceFrequency, RecurrenceInput } from '../types/api';

/** Domingo primeiro, como na maioria dos calendários. */
export function weekdayOptions(t: Dictionary): ReadonlyArray<{ value: number; label: string }> {
  return t.weekdays.map((label, value) => ({ value, label }));
}

export function monthOptions(t: Dictionary): ReadonlyArray<{ value: number; label: string }> {
  return t.months.map((label, index) => ({ value: index + 1, label }));
}

export function frequencyOptions(
  t: Dictionary,
): ReadonlyArray<{ value: RecurrenceFrequency; label: string }> {
  return [
    { value: 'monthly', label: t.recurrences.monthly },
    { value: 'weekly', label: t.recurrences.weekly },
    { value: 'yearly', label: t.recurrences.yearly },
  ];
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
  t: Dictionary,
): string {
  if (rule.frequency === 'weekly') {
    return t.recurrences.everyWeekday(t.weekdays[rule.weekday] ?? '');
  }
  if (rule.frequency === 'yearly') {
    return t.recurrences.everyYearOn(rule.dayOfMonth, t.months[rule.month - 1] ?? '');
  }
  return t.recurrences.everyMonthOn(rule.dayOfMonth);
}
