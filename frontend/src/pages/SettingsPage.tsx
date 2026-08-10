import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, TextInput } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { IconTrash } from '../components/ui/Icons';
import { useFinance } from '../context/FinanceContext';
import { useToast } from '../context/ToastContext';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useApiResource } from '../hooks/useApiResource';
import { api, ApiError, RESET_CONFIRMATION } from '../lib/api';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Preferências do aplicativo e gerenciamento dos seus dados."
      />
      <div className="flex max-w-2xl flex-col gap-4 sm:gap-6">
        <AppearanceCard />
        <DataCard />
        <ResetCard />
      </div>
    </>
  );
}

function AppearanceCard() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Card>
      <CardHeader title="Aparência" description="O tema fica salvo neste navegador." />
      <div className="px-5 pt-5 pb-6 sm:px-6">
        <SegmentedControl
          ariaLabel="Tema da interface"
          options={THEME_OPTIONS}
          value={theme}
          onChange={(next) => {
            if (next !== theme) toggleTheme();
          }}
        />
      </div>
    </Card>
  );
}

function DataCard() {
  return (
    <Card>
      <CardHeader
        title="Seus dados"
        description="Tudo fica em um arquivo SQLite no seu computador. Nada é enviado para a internet."
      />
      <div className="space-y-3 px-5 pt-5 pb-6 text-[13px] leading-relaxed text-ink-2 sm:px-6">
        <p>
          O banco fica em{' '}
          <code className="rounded bg-surface-inset px-1.5 py-0.5">data/finance.sqlite</code>, na
          pasta do projeto. Faça uma cópia desse arquivo para ter um backup.
        </p>
        <p>
          Para carregar dados de demonstração, rode{' '}
          <code className="rounded bg-surface-inset px-1.5 py-0.5">npm run seed</code> no terminal.
        </p>
        <p>
          Seu saldo inicial e suas contas ficam em{' '}
          <Link to="/usuario" className="font-medium text-accent underline-offset-4 hover:underline">
            Usuário
          </Link>
          .
        </p>
      </div>
    </Card>
  );
}

function ResetCard() {
  const { refresh, version } = useFinance();
  const { notify } = useToast();
  const navigate = useNavigate();

  const transactions = useApiResource(() => api.listTransactions({ limit: 1 }), [version]);
  const total = transactions.data?.total ?? 0;

  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReset = confirmation.trim().toUpperCase() === RESET_CONFIRMATION;

  function openDialog(): void {
    setConfirmation('');
    setError(null);
    setOpen(true);
  }

  async function handleReset(): Promise<void> {
    if (!canReset) return;
    setResetting(true);
    setError(null);
    try {
      const result = await api.resetAllData();
      setOpen(false);
      refresh();
      navigate('/');
      notify(
        result.deletedTransactions > 0
          ? `Tudo apagado — ${result.deletedTransactions} ${
              result.deletedTransactions === 1 ? 'transação removida' : 'transações removidas'
            }`
          : 'Tudo apagado',
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível apagar os dados. Tente novamente.',
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <Card className="border-expense/30">
        <CardHeader
          title="Resetar tudo"
          description="Apaga todas as transações, contas e o saldo inicial. O aplicativo volta ao estado de primeira execução."
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-6 sm:px-6">
          <p className="text-[13px] text-ink-3">
            {transactions.isInitialLoading
              ? 'Verificando seus dados…'
              : total === 0
                ? 'Não há nada para apagar no momento.'
                : `${total} ${total === 1 ? 'transação será apagada' : 'transações serão apagadas'}. Esta ação não pode ser desfeita.`}
          </p>
          <Button variant="danger" icon={<IconTrash />} onClick={openDialog}>
            Resetar tudo
          </Button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Apagar todos os dados?"
        description="Transações, contas e saldo inicial serão removidos do banco. Não há como desfazer."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={resetting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleReset} loading={resetting} disabled={!canReset}>
              Apagar tudo
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ul className="space-y-1.5 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
            <li>
              <strong className="font-semibold text-ink">{total}</strong>{' '}
              {total === 1 ? 'transação' : 'transações'} do histórico
            </li>
            <li>As contas cadastradas</li>
            <li>O saldo inicial configurado</li>
          </ul>

          <Field label={`Digite ${RESET_CONFIRMATION} para confirmar`} error={error ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={RESET_CONFIRMATION}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Modal>
    </>
  );
}
