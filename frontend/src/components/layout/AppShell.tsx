import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Button, IconButton } from '../ui/Button';
import {
  IconChart,
  IconDashboard,
  IconList,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
} from '../ui/Icons';
import { useTheme } from '../../hooks/useTheme';
import { useTransactionDialog } from '../../context/TransactionDialogContext';
import { cn } from '../../lib/cn';

const NAV_ITEMS = [
  { to: '/', label: 'Visão geral', icon: IconDashboard },
  { to: '/transacoes', label: 'Transações', icon: IconList },
  { to: '/analises', label: 'Análises', icon: IconChart },
  { to: '/ajustes', label: 'Ajustes', icon: IconSettings },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-income text-white">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path
            d="M16 7.5v17M20.2 12.2c0-1.6-1.9-2.9-4.2-2.9s-4.2 1.3-4.2 2.9c0 4 8.4 2.4 8.4 6.4 0 1.6-1.9 2.9-4.2 2.9s-4.2-1.3-4.2-2.9"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-[0.06em] text-ink">CIFRA</span>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton
      label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
      onClick={toggleTheme}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </IconButton>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { openNew } = useTransactionDialog();
  const location = useLocation();

  return (
    <div className="min-h-dvh bg-app">
      {/* Navegação lateral — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="px-2">
          <Brand />
        </div>

        <Button
          variant="primary"
          icon={<IconPlus />}
          className="mt-7 w-full"
          onClick={() => openNew()}
        >
          Nova transação
        </Button>

        <nav className="mt-7 flex flex-1 flex-col gap-0.5" aria-label="Seções do aplicativo">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <p className="px-2 text-xs text-ink-3">Dados salvos no seu computador</p>
          <ThemeToggle />
        </div>
      </aside>

      {/* Barra superior — mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/85 px-4 backdrop-blur-md lg:hidden">
        <Brand />
        <ThemeToggle />
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 sm:pt-8 lg:px-10 lg:pb-12">
          {children}
        </div>
      </main>

      {/* Ação rápida — mobile */}
      <button
        type="button"
        onClick={() => openNew()}
        className={cn(
          'fixed right-4 bottom-20 z-30 flex h-12 items-center gap-2 rounded-full px-5 lg:hidden',
          'bg-primary text-sm font-medium text-primary-ink shadow-[var(--shadow-pop)]',
          'transition-transform duration-150 active:scale-95',
        )}
      >
        <IconPlus />
        Nova
      </button>

      {/* Navegação inferior — mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label="Seções do aplicativo"
      >
        {NAV_ITEMS.map((item) => {
          const active =
            item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-ink' : 'text-ink-3',
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
    isActive ? 'bg-surface-inset text-ink' : 'text-ink-2 hover:bg-surface-inset/60 hover:text-ink',
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
