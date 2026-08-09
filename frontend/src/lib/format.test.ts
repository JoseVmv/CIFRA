import { describe, expect, it } from 'vitest';
import {
  centsToDigits,
  digitsToCents,
  formatCurrency,
  formatDecimal,
  formatSigned,
  toIsoDate,
} from './format';

/** O `Intl` separa "R$" do número com espaço fixo (U+00A0); `\s` cobre os dois casos. */
const plain = (value: string): string => value.replace(/\s/g, ' ');

describe('formatação de dinheiro', () => {
  it('formata centavos em reais', () => {
    expect(plain(formatCurrency(845000))).toBe('R$ 8.450,00');
    expect(plain(formatCurrency(0))).toBe('R$ 0,00');
    expect(plain(formatCurrency(5))).toBe('R$ 0,05');
  });

  it('mostra o sinal conforme o tipo da transação', () => {
    expect(plain(formatSigned(240000, 'income'))).toBe('+ R$ 2.400,00');
    expect(plain(formatSigned(12000, 'expense'))).toBe('− R$ 120,00');
  });

  it('converte o que é digitado em centavos inteiros', () => {
    expect(digitsToCents('1050')).toBe(1050);
    expect(digitsToCents('R$ 10,50')).toBe(1050);
    expect(digitsToCents('')).toBe(0);
    expect(digitsToCents('abc')).toBe(0);
  });

  it('faz a volta centavos → dígitos sem perder precisão', () => {
    for (const cents of [1, 99, 1050, 123456789]) {
      expect(digitsToCents(centsToDigits(cents))).toBe(cents);
    }
  });

  it('formata o valor do campo sem símbolo', () => {
    expect(formatDecimal(1050)).toBe('10,50');
    expect(formatDecimal(100000)).toBe('1.000,00');
  });
});

describe('datas', () => {
  it('converte Date para YYYY-MM-DD no fuso local', () => {
    expect(toIsoDate(new Date(2026, 7, 9))).toBe('2026-08-09');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});
