import { PERIOD_OPTIONS, useFinance } from '../../context/FinanceContext';

/**
 * Um único seletor de período por tela, acima de tudo que ele filtra —
 * cards e gráficos respondem juntos à mesma fatia de tempo.
 */
export function PeriodSelector() {
  const { period, setPeriod } = useFinance();

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
      <div
        role="radiogroup"
        aria-label="Período analisado"
        className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-inset p-0.5"
      >
        {PERIOD_OPTIONS.map((option) => {
          const selected = option.key === period;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              title={option.label}
              onClick={() => setPeriod(option.key)}
              className={
                'h-8 rounded-[10px] px-3 text-[13px] font-medium whitespace-nowrap transition-all duration-150 ' +
                (selected
                  ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                  : 'text-ink-3 hover:text-ink')
              }
            >
              {option.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function usePeriodLabel(): string {
  const { period } = useFinance();
  return PERIOD_OPTIONS.find((option) => option.key === period)?.label ?? '';
}
