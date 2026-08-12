import { afterEach, describe, expect, it } from 'vitest';
import {
  centsToDigits,
  currencySymbol,
  digitsToCents,
  formatCurrency,
  formatDecimal,
  formatSigned,
  setFormatting,
  toIsoDate,
} from './format';

/** O `Intl` separa "R$" do número com espaço fixo (U+00A0); `\s` cobre os dois casos. */
const plain = (value: string): string => value.replace(/\s/g, ' ');

// Locale e moeda são estado de módulo: cada teste que mexe neles devolve o
// padrão, senão a ordem dos testes passaria a importar.
afterEach(() => setFormatting('pt-BR', 'BRL'));

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

describe('idioma e moeda', () => {
  it('a moeda troca o símbolo sem mexer no número', () => {
    setFormatting('pt-BR', 'USD');
    expect(plain(formatCurrency(845000))).toBe('US$ 8.450,00');
    expect(currencySymbol()).toBe('US$');
  });

  it('o idioma muda os separadores e a posição do símbolo', () => {
    setFormatting('en-US', 'BRL');
    expect(plain(formatCurrency(845000))).toBe('R$8,450.00');

    setFormatting('es-ES', 'BRL');
    expect(plain(formatCurrency(845000))).toBe('8450,00 BRL');
  });

  /**
   * O par importa: dólar em português é "US$" (para distinguir do real), em
   * inglês é só "$". Por isso o cache de formatadores é indexado pelos dois.
   */
  it('o símbolo depende do par idioma+moeda, não só da moeda', () => {
    setFormatting('pt-BR', 'USD');
    expect(currencySymbol()).toBe('US$');

    setFormatting('en-US', 'USD');
    expect(currencySymbol()).toBe('$');
  });

  it('o mesmo número de centavos vale para as duas moedas', () => {
    setFormatting('pt-BR', 'BRL');
    const emReal = formatCurrency(10_000);
    setFormatting('pt-BR', 'USD');
    const emDolar = formatCurrency(10_000);

    // Só o símbolo separa os dois: não existe conversão no caminho.
    expect(plain(emReal)).toBe('R$ 100,00');
    expect(plain(emDolar)).toBe('US$ 100,00');
  });
});

describe('datas', () => {
  it('converte Date para YYYY-MM-DD no fuso local', () => {
    expect(toIsoDate(new Date(2026, 7, 9))).toBe('2026-08-09');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});
