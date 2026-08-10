import { PERIOD_OPTIONS, useFinance } from '../../context/FinanceContext';
import { IconButton } from '../ui/Button';
import { IconChevronLeft, IconChevronRight } from '../ui/Icons';
import { cn } from '../../lib/cn';

/**
 * Um único seletor de período por tela, acima de tudo que ele filtra — cards e
 * gráficos respondem juntos à mesma fatia de tempo.
 *
 * As setas movem a janela inteira: um mês por vez em "Este mês", três meses em
 * "Últimos 3 meses", e assim por diante. Avançar para o futuro fica desabilitado.
 */
export function PeriodSelector() {
  const {
    period,
    setPeriod,
    windowLabel,
    goToPreviousWindow,
    goToNextWindow,
    goToToday,
    canNavigate,
    isAtCurrentWindow,
  } = useFinance();

  return (
    <div className="flex flex-wrap items-center gap-2">
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
                className={cn(
                  'h-8 rounded-[10px] px-3 text-[13px] font-medium whitespace-nowrap transition-all duration-150',
                  selected
                    ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                    : 'text-ink-3 hover:text-ink',
                )}
              >
                {option.short}
              </button>
            );
          })}
        </div>
      </div>

      {canNavigate && (
        <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-0.5">
          <IconButton
            label="Período anterior"
            className="size-8 rounded-[10px]"
            onClick={goToPreviousWindow}
          >
            <IconChevronLeft />
          </IconButton>

          <span
            aria-live="polite"
            className="min-w-32 px-1 text-center text-[13px] font-medium text-ink"
          >
            {windowLabel}
          </span>

          <IconButton
            label="Próximo período"
            className="size-8 rounded-[10px]"
            disabled={isAtCurrentWindow}
            onClick={goToNextWindow}
          >
            <IconChevronRight />
          </IconButton>
        </div>
      )}

      {canNavigate && !isAtCurrentWindow && (
        <button
          type="button"
          onClick={goToToday}
          className="h-8 rounded-xl border border-line px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-inset hover:text-ink"
        >
          Hoje
        </button>
      )}
    </div>
  );
}

/** Rótulo completo do que está sendo mostrado — usado nos cabeçalhos dos cards. */
export function usePeriodLabel(): string {
  const { period, windowLabel } = useFinance();
  if (period === 'all') return 'Todo o período';
  return windowLabel;
}
