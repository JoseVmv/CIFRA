import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useLanguage, type Language } from '../i18n';
import type { Currency } from '../types/api';
import type { Dictionary } from '../i18n/pt';
import { api } from '../lib/api';
import { addMonths, isCurrentWindow, periodStep, periodWindowLabel } from '../lib/months';
import { todayIso } from '../lib/format';
import { useApiResource } from '../hooks/useApiResource';
import type { Account, CategoriesResponse, PeriodKey, Settings } from '../types/api';

/**
 * Períodos são meses de calendário fechados, não janelas móveis: "Este mês" vai
 * do dia 1 ao último dia do mês.
 *
 * A ordem é a da interface; os rótulos vêm do dicionário via `usePeriodOptions`.
 */
export const PERIOD_KEYS: readonly PeriodKey[] = ['month', '3m', '6m', 'year', 'all'];

const PERIOD_LABELS: Record<PeriodKey, { label: keyof Dictionary['period']; short: keyof Dictionary['period'] }> = {
  month: { label: 'month', short: 'monthShort' },
  '3m': { label: 'threeMonths', short: 'threeMonthsShort' },
  '6m': { label: 'sixMonths', short: 'sixMonthsShort' },
  year: { label: 'year', short: 'yearShort' },
  all: { label: 'all', short: 'allShort' },
};

export function periodOptions(
  t: Dictionary,
): ReadonlyArray<{ key: PeriodKey; label: string; short: string }> {
  return PERIOD_KEYS.map((key) => ({
    key,
    label: t.period[PERIOD_LABELS[key].label] as string,
    short: t.period[PERIOD_LABELS[key].short] as string,
  }));
}

interface FinanceContextValue {
  period: PeriodKey;
  setPeriod: (period: PeriodKey) => void;
  /** Data (`YYYY-MM-DD`) em torno da qual o período é montado. */
  anchor: string;
  /** Rótulo da janela atual: "Agosto 2026", "Jun – Ago 2026", "2026"… */
  windowLabel: string;
  goToPreviousWindow: () => void;
  goToNextWindow: () => void;
  goToToday: () => void;
  canNavigate: boolean;
  /** `false` quando o usuário está olhando um período passado. */
  isAtCurrentWindow: boolean;
  /** Muda a cada mutação; as telas usam como dependência para recarregar. */
  version: number;
  refresh: () => void;
  settings: Settings | null;
  categories: CategoriesResponse | null;
  /** `null` enquanto carrega. Compartilhado para não buscar a mesma lista em três telas. */
  accounts: Account[] | null;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const PERIOD_STORAGE_KEY = 'cifra.period';

function readStoredPeriod(): PeriodKey {
  try {
    const stored = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (stored && PERIOD_KEYS.includes(stored as PeriodKey)) {
      return stored as PeriodKey;
    }
  } catch {
    /* localStorage indisponível */
  }
  return 'month';
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { language, setLanguage, setCurrency } = useLanguage();
  const [period, setPeriodState] = useState<PeriodKey>(readStoredPeriod);
  // A referência sempre começa em hoje: abrir o app olhando um mês antigo seria confuso.
  const [anchor, setAnchor] = useState<string>(todayIso);
  const [version, setVersion] = useState(0);

  const setPeriod = useCallback((next: PeriodKey) => {
    setPeriodState(next);
    try {
      localStorage.setItem(PERIOD_STORAGE_KEY, next);
    } catch {
      /* ignorado */
    }
  }, []);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const step = periodStep(period);
  const canNavigate = step > 0;
  const isAtCurrentWindow = isCurrentWindow(period, anchor);

  const goToPreviousWindow = useCallback(() => {
    if (step > 0) setAnchor((current) => addMonths(current, -step));
  }, [step]);

  const goToNextWindow = useCallback(() => {
    if (step > 0) setAnchor((current) => addMonths(current, step));
  }, [step]);

  const goToToday = useCallback(() => setAnchor(todayIso()), []);

  const settings = useApiResource(() => api.getSettings(), [version]);
  const categories = useApiResource(() => api.getCategories(), [version]);
  const accounts = useApiResource(() => api.listAccounts(), [version]);

  /**
   * Idioma e moeda abriram com o espelho em localStorage, que existe só para a
   * primeira pintura. Quando os ajustes chegam, o servidor manda — é o que faz
   * a escolha feita no PC valer também no celular.
   *
   * A comparação é com o **último valor visto do servidor**, e não com o que
   * está em uso. Trocar na tela de ajustes muda o estado local na hora e só
   * depois salva; enquanto o refetch não termina, `settings.data` ainda é o
   * valor antigo, e comparar com ele reverteria a escolha do usuário no mesmo
   * instante em que ele a faz.
   */
  const serverLanguage = settings.data?.language;
  const lastServerLanguage = useRef<Language | null>(null);
  useEffect(() => {
    if (!serverLanguage || serverLanguage === lastServerLanguage.current) return;
    lastServerLanguage.current = serverLanguage;
    setLanguage(serverLanguage);
  }, [serverLanguage, setLanguage]);

  const serverCurrency = settings.data?.currency;
  const lastServerCurrency = useRef<Currency | null>(null);
  useEffect(() => {
    if (!serverCurrency || serverCurrency === lastServerCurrency.current) return;
    lastServerCurrency.current = serverCurrency;
    setCurrency(serverCurrency);
  }, [serverCurrency, setCurrency]);

  const value = useMemo<FinanceContextValue>(
    () => ({
      period,
      setPeriod,
      anchor,
      // `language` entra na dependência porque o nome do mês sai do locale:
      // sem ele o rótulo ficaria no idioma anterior até a próxima navegação.
      windowLabel: periodWindowLabel(period, anchor),
      goToPreviousWindow,
      goToNextWindow,
      goToToday,
      canNavigate,
      isAtCurrentWindow,
      version,
      refresh,
      settings: settings.data,
      categories: categories.data,
      accounts: accounts.data?.items ?? null,
    }),
    [
      period,
      setPeriod,
      anchor,
      language,
      goToPreviousWindow,
      goToNextWindow,
      goToToday,
      canNavigate,
      isAtCurrentWindow,
      version,
      refresh,
      settings.data,
      categories.data,
      accounts.data,
    ],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance precisa estar dentro de <FinanceProvider>.');
  return context;
}
