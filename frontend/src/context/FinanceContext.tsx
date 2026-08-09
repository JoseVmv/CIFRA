import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useApiResource } from '../hooks/useApiResource';
import type { CategoriesResponse, PeriodKey, Settings } from '../types/api';

export const PERIOD_OPTIONS: ReadonlyArray<{ key: PeriodKey; label: string; short: string }> = [
  { key: '7d', label: 'Últimos 7 dias', short: '7 dias' },
  { key: '30d', label: 'Últimos 30 dias', short: '30 dias' },
  { key: '90d', label: 'Últimos 90 dias', short: '90 dias' },
  { key: 'month', label: 'Este mês', short: 'Este mês' },
  { key: 'all', label: 'Todo o período', short: 'Tudo' },
];

interface FinanceContextValue {
  period: PeriodKey;
  setPeriod: (period: PeriodKey) => void;
  /** Muda a cada mutação; as telas usam como dependência para recarregar. */
  version: number;
  refresh: () => void;
  settings: Settings | null;
  categories: CategoriesResponse | null;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const PERIOD_STORAGE_KEY = 'cifra.period';

function readStoredPeriod(): PeriodKey {
  try {
    const stored = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (stored && PERIOD_OPTIONS.some((option) => option.key === stored)) {
      return stored as PeriodKey;
    }
  } catch {
    /* localStorage indisponível */
  }
  return '30d';
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<PeriodKey>(readStoredPeriod);
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

  const settings = useApiResource(() => api.getSettings(), [version]);
  const categories = useApiResource(() => api.getCategories(), [version]);

  const value = useMemo<FinanceContextValue>(
    () => ({
      period,
      setPeriod,
      version,
      refresh,
      settings: settings.data,
      categories: categories.data,
    }),
    [period, setPeriod, version, refresh, settings.data, categories.data],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance precisa estar dentro de <FinanceProvider>.');
  return context;
}
