import type { InputHTMLAttributes } from 'react';
import { digitsToCents, formatDecimal } from '../../lib/format';
import { cn } from '../../lib/cn';

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>;

interface CurrencyInputProps extends NativeProps {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  /** `lg` para o valor principal de um formulário; `md` para listas e linhas. */
  size?: 'md' | 'lg';
  prefix?: string;
  invalid?: boolean;
}

const SIZES = {
  md: 'h-11 text-sm',
  lg: 'h-14 text-2xl font-semibold tracking-[-0.02em]',
} as const;

/**
 * Campo de dinheiro: o usuário digita só dígitos e o valor é formatado enquanto
 * escreve — "8000" vira "80,00". Nunca há ponto flutuante no caminho, o estado é
 * sempre o inteiro em centavos.
 */
export function CurrencyInput({
  valueCents,
  onChangeCents,
  size = 'md',
  prefix = 'R$',
  invalid,
  className,
  ...props
}: CurrencyInputProps) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 font-medium',
          size === 'lg' ? 'left-4 text-lg' : 'left-3 text-[13px]',
          valueCents !== 0 ? 'text-ink-2' : 'text-ink-3',
        )}
      >
        {prefix}
      </span>
      <input
        inputMode="numeric"
        autoComplete="off"
        placeholder="0,00"
        value={valueCents !== 0 ? formatDecimal(valueCents) : ''}
        onChange={(event) => onChangeCents(digitsToCents(event.target.value))}
        aria-invalid={invalid || undefined}
        className={cn(
          'tnum w-full rounded-xl border border-line bg-surface pr-3.5 text-right text-ink',
          'placeholder:text-ink-3 transition-colors duration-150',
          'hover:border-line-strong focus:border-accent focus:outline-none',
          size === 'lg' ? 'pl-12' : 'pl-11',
          SIZES[size],
          invalid && 'border-expense/60',
          className,
        )}
        {...props}
      />
    </div>
  );
}
