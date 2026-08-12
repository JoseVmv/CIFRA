import { TRANSFER_CATEGORY } from '../types/api';
import type { Language } from './index';

/**
 * Rótulo das categorias sugeridas em cada idioma.
 *
 * A chave é o nome **canônico** — o que fica gravado em cada transação. Ele é o
 * texto em português por razão histórica: era o valor que já estava no banco
 * antes de existirem outros idiomas, e mantê-lo evitou reescrever o histórico
 * inteiro. Trocar de idioma muda só a etiqueta na tela; o agrupamento das
 * estatísticas continua sendo o mesmo, porque o valor gravado nunca muda.
 *
 * Categorias criadas pelo usuário não estão aqui: elas aparecem exatamente como
 * ele escreveu, em qualquer idioma.
 */
const LABELS: Record<string, Record<Language, string>> = {
  // Entradas
  'Salário': { pt: 'Salário', en: 'Salary', es: 'Salario' },
  Freelance: { pt: 'Freelance', en: 'Freelance', es: 'Freelance' },
  Investimentos: { pt: 'Investimentos', en: 'Investments', es: 'Inversiones' },
  Vendas: { pt: 'Vendas', en: 'Sales', es: 'Ventas' },
  Presente: { pt: 'Presente', en: 'Gift', es: 'Regalo' },
  Reembolso: { pt: 'Reembolso', en: 'Refund', es: 'Reembolso' },

  // Saídas
  'Alimentação': { pt: 'Alimentação', en: 'Food', es: 'Comida' },
  Transporte: { pt: 'Transporte', en: 'Transport', es: 'Transporte' },
  Moradia: { pt: 'Moradia', en: 'Housing', es: 'Vivienda' },
  Faculdade: { pt: 'Faculdade', en: 'Education', es: 'Educación' },
  'Saúde': { pt: 'Saúde', en: 'Health', es: 'Salud' },
  Lazer: { pt: 'Lazer', en: 'Leisure', es: 'Ocio' },
  Compras: { pt: 'Compras', en: 'Shopping', es: 'Compras' },
  Assinaturas: { pt: 'Assinaturas', en: 'Subscriptions', es: 'Suscripciones' },

  // Comum aos dois tipos
  Outros: { pt: 'Outros', en: 'Other', es: 'Otros' },

  // Fixa das transferências — o usuário nunca escolhe, mas ela aparece na lista.
  [TRANSFER_CATEGORY]: { pt: 'Transferência', en: 'Transfer', es: 'Transferencia' },
};

/** O que mostrar na tela para uma categoria. Personalizadas passam intactas. */
export function categoryLabel(canonical: string, language: Language): string {
  return LABELS[canonical]?.[language] ?? canonical;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

/**
 * Um nome novo colide com alguma categoria sugerida?
 *
 * Compara contra os rótulos em **todos** os idiomas, não só no atual: sem isso,
 * alguém no inglês criaria "Comida" sem aviso e depois encontraria duas
 * "Comida" na lista ao mudar para o espanhol.
 */
export function collidesWithSuggested(name: string, suggested: readonly string[]): boolean {
  const target = normalize(name);
  return suggested.some((canonical) => {
    const labels = LABELS[canonical];
    if (!labels) return normalize(canonical) === target;
    return Object.values(labels).some((label) => normalize(label) === target);
  });
}

/** Ordena por rótulo visível — a lista segue o alfabeto do idioma em uso. */
export function compareByLabel(a: string, b: string, language: Language, locale: string): number {
  return categoryLabel(a, language).localeCompare(categoryLabel(b, language), locale);
}
