import { describe, expect, it } from 'vitest';
import { describeSchedule } from './recurrence';

describe('descrição de uma recorrência', () => {
  it('mensal diz o dia do mês', () => {
    expect(describeSchedule({ frequency: 'monthly', dayOfMonth: 5, weekday: 1, month: 1 })).toBe(
      'Todo dia 5',
    );
  });

  it('semanal diz o dia da semana', () => {
    expect(describeSchedule({ frequency: 'weekly', dayOfMonth: 5, weekday: 1, month: 1 })).toBe(
      'Toda segunda-feira',
    );
  });

  it('anual diz o dia e o mês', () => {
    expect(describeSchedule({ frequency: 'yearly', dayOfMonth: 10, weekday: 1, month: 3 })).toBe(
      'Todo 10 de março',
    );
  });
});
