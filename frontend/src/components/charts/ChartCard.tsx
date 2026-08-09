import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardHeader } from '../ui/Card';
import { IconButton } from '../ui/Button';
import { IconChart, IconTable } from '../ui/Icons';
import { cn } from '../../lib/cn';

interface LegendItem {
  label: string;
  color: string;
}

interface ChartCardProps {
  title: string;
  description?: string;
  legend?: LegendItem[];
  /** Tabela equivalente ao gráfico — todo valor precisa ser legível sem cor. */
  table?: ReactNode;
  children: ReactNode;
  /** Mantém o conteúdo anterior esmaecido durante o refetch, sem pular layout. */
  dimmed?: boolean;
  className?: string;
}

export function ChartCard({
  title,
  description,
  legend,
  table,
  children,
  dimmed = false,
  className,
}: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title={title}
        description={description}
        action={
          table && (
            <IconButton
              label={view === 'chart' ? 'Ver os dados em tabela' : 'Voltar para o gráfico'}
              onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            >
              {view === 'chart' ? <IconTable /> : <IconChart />}
            </IconButton>
          )
        }
      />

      {legend && legend.length > 0 && view === 'chart' && (
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pt-4 sm:px-6">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-[13px] text-ink-2">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <div
        className={cn(
          'px-2 pt-4 pb-5 transition-opacity duration-200 sm:px-4 sm:pb-6',
          dimmed && 'opacity-55',
        )}
      >
        {view === 'chart' ? children : <div className="px-3 sm:px-2">{table}</div>}
      </div>
    </Card>
  );
}
