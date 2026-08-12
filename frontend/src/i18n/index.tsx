import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setApiMessages } from '../lib/api';
import { setFormatting } from '../lib/format';
import { CURRENCIES, type Currency } from '../types/api';
import { en } from './en';
import { es } from './es';
import { pt, type Dictionary } from './pt';

export const LANGUAGES = ['pt', 'en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

const DICTIONARIES: Record<Language, Dictionary> = { pt, en, es };

/** Nome do idioma na própria língua — é assim que se escolhe um idioma. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
};

/**
 * Locale de formatação de cada idioma. Datas e separadores seguem daqui; a
 * moeda **não** — o dinheiro continua sendo o mesmo, então ler o app em inglês
 * não transforma reais em dólares.
 */
const LOCALES: Record<Language, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
};

/**
 * Espelho local das escolhas que vivem no servidor.
 *
 * Serve só para a primeira pintura: sem ele o app abriria em português com R$
 * por uma fração de segundo, até `GET /settings` responder. O servidor continua
 * sendo a fonte da verdade — quando a resposta chega, ela manda.
 */
const LANGUAGE_KEY = 'cifra.language';
const CURRENCY_KEY = 'cifra.currency';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
  } catch {
    /* localStorage indisponível */
  }
  return fallback;
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignorado */
  }
}

interface I18nContextValue {
  language: Language;
  /** `pt-BR`, `en-US`, `es-ES` — para `Intl` e `localeCompare`. */
  locale: string;
  currency: Currency;
  t: Dictionary;
  /** Aplica na hora e guarda o espelho. Salvar no servidor é de quem chama. */
  setLanguage: (language: Language) => void;
  setCurrency: (currency: Currency) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() =>
    read(LANGUAGE_KEY, LANGUAGES, 'pt'),
  );
  const [currency, setCurrencyState] = useState<Currency>(() =>
    read(CURRENCY_KEY, CURRENCIES, 'BRL'),
  );

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    write(LANGUAGE_KEY, next);
  }, []);

  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    write(CURRENCY_KEY, next);
  }, []);

  // Antes de renderizar os filhos, e não num efeito: `formatCurrency` e as
  // outras funções puras são chamadas durante o render deles, então precisam
  // já enxergar os valores novos nesta mesma passada.
  setFormatting(LOCALES[language], currency);
  setApiMessages(DICTIONARIES[language].errors);
  document.documentElement.lang = LOCALES[language];

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: LOCALES[language],
      currency,
      t: DICTIONARIES[language],
      setLanguage,
      setCurrency,
    }),
    [language, currency, setLanguage, setCurrency],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n precisa estar dentro de <I18nProvider>.');
  return context;
}

/** O dicionário do idioma em uso: `const t = useT()` e depois `t.common.save`. */
export function useT(): Dictionary {
  return useI18n().t;
}

export function useLanguage(): Omit<I18nContextValue, 't'> {
  const { language, locale, currency, setLanguage, setCurrency } = useI18n();
  return { language, locale, currency, setLanguage, setCurrency };
}
