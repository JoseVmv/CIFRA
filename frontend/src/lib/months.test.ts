import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMonths,
  endOfMonth,
  isCurrentWindow,
  periodStep,
  periodWindow,
  periodWindowLabel,
} from './months';

afterEach(() => {
  vi.useRealTimers();
});

/** Congela o relógio para os testes que dependem de "hoje". */
function freezeToday(iso: string): void {
  vi.useFakeTimers();
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  vi.setSystemTime(new Date(year, month - 1, day, 12));
}

describe('aritmética de meses', () => {
  it('soma e subtrai meses', () => {
    expect(addMonths('2026-08-09', -1)).toBe('2026-07-09');
    expect(addMonths('2026-08-09', 1)).toBe('2026-09-09');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('não escorrega quando o dia não existe no mês de destino', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29'); // bissexto
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('encontra o último dia do mês', () => {
    expect(endOfMonth('2026-08-01')).toBe('2026-08-31');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2026-04-30')).toBe('2026-04-30');
  });
});

describe('janelas de período', () => {
  it('monta a mesma janela que o backend', () => {
    expect(periodWindow('month', '2026-08-09')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(periodWindow('3m', '2026-08-09')).toEqual({ from: '2026-06-01', to: '2026-08-31' });
    expect(periodWindow('6m', '2026-08-09')).toEqual({ from: '2026-03-01', to: '2026-08-31' });
    expect(periodWindow('year', '2026-08-09')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(periodWindow('all', '2026-08-09')).toBeNull();
  });

  it('o passo das setas é o tamanho da janela', () => {
    expect(periodStep('month')).toBe(1);
    expect(periodStep('3m')).toBe(3);
    expect(periodStep('6m')).toBe(6);
    expect(periodStep('year')).toBe(12);
    expect(periodStep('all')).toBe(0);
  });

  it('reconhece quando a janela já alcança hoje', () => {
    freezeToday('2026-08-09');

    expect(isCurrentWindow('month', '2026-08-09')).toBe(true);
    expect(isCurrentWindow('month', '2026-07-09')).toBe(false);
    expect(isCurrentWindow('3m', '2026-08-09')).toBe(true);
    expect(isCurrentWindow('year', '2026-08-09')).toBe(true);
    expect(isCurrentWindow('year', '2025-08-09')).toBe(false);
    expect(isCurrentWindow('all', '2020-01-01')).toBe(true);
  });
});

describe('rótulo da janela', () => {
  it('nomeia o mês por extenso', () => {
    expect(periodWindowLabel('month', '2026-08-09')).toBe('Agosto 2026');
    expect(periodWindowLabel('month', '2026-01-31')).toBe('Janeiro 2026');
  });

  it('mostra o intervalo em períodos de vários meses', () => {
    expect(periodWindowLabel('3m', '2026-08-09')).toBe('Jun – Ago 2026');
    expect(periodWindowLabel('6m', '2026-08-09')).toBe('Mar – Ago 2026');
  });

  it('inclui os dois anos quando o intervalo atravessa a virada', () => {
    expect(periodWindowLabel('3m', '2026-01-15')).toBe('Nov 2025 – Jan 2026');
  });

  it('usa o ano no período anual e um texto fixo em "Tudo"', () => {
    expect(periodWindowLabel('year', '2026-08-09')).toBe('2026');
    expect(periodWindowLabel('all', '2026-08-09')).toBe('Todo o período');
  });
});
