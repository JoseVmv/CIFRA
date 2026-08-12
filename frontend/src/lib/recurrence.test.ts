import { describe, expect, it } from 'vitest';
import { describeSchedule } from './recurrence';
import { en } from '../i18n/en';
import { pt } from '../i18n/pt';

describe('descrição de uma recorrência', () => {
  it('mensal diz o dia do mês', () => {
    expect(describeSchedule({ frequency: 'monthly', dayOfMonth: 5, weekday: 1, month: 1 }, pt)).toBe(
      'Todo dia 5',
    );
  });

  it('semanal diz o dia da semana', () => {
    expect(describeSchedule({ frequency: 'weekly', dayOfMonth: 5, weekday: 1, month: 1 }, pt)).toBe(
      'Toda segunda-feira',
    );
  });

  it('anual diz o dia e o mês', () => {
    expect(describeSchedule({ frequency: 'yearly', dayOfMonth: 10, weekday: 1, month: 3 }, pt)).toBe(
      'Todo 10 de março',
    );
  });

  // A ordem das palavras muda de idioma para idioma — por isso a frase inteira
  // vem do dicionário, em vez de ser montada com pedaços concatenados.
  it('segue o idioma, inclusive na ordem de dia e mês', () => {
    expect(describeSchedule({ frequency: 'yearly', dayOfMonth: 10, weekday: 1, month: 3 }, en)).toBe(
      'Every March 10',
    );
    expect(describeSchedule({ frequency: 'weekly', dayOfMonth: 5, weekday: 1, month: 1 }, en)).toBe(
      'Every Monday',
    );
  });
});
