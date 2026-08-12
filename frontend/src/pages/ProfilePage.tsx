import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/AppShell';
import { AccountsPanel } from '../components/profile/AccountsPanel';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { Field, TextInput } from '../components/ui/Field';
import { Skeleton } from '../components/ui/States';
import { useFinance } from '../context/FinanceContext';
import { useToast } from '../context/ToastContext';
import { useApiResource } from '../hooks/useApiResource';
import { useT } from '../i18n';
import { api, ApiError } from '../lib/api';
import { currencySymbol, formatCurrency } from '../lib/format';

export function ProfilePage() {
  const t = useT();

  return (
    <>
      <PageHeader title={t.profile.title} description={t.profile.subtitle} />
      <div className="flex max-w-2xl flex-col gap-4 sm:gap-6">
        <IdentityCard />
        <InitialBalanceCard />
      </div>
    </>
  );
}

function IdentityCard() {
  const { settings, refresh } = useFinance();
  const { notify } = useToast();
  const t = useT();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setName(settings.displayName);
  }, [settings]);

  const unchanged = settings?.displayName === name.trim();

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({ displayName: name.trim() });
      notify(t.profile.nameSaved);
      refresh();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : t.profile.nameFailed, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t.profile.nameTitle} description={t.profile.nameDescription} />
      <form onSubmit={handleSubmit} className="px-5 pt-5 pb-6 sm:px-6">
        {!settings ? (
          <Skeleton className="h-11 w-full" />
        ) : (
          <Field label={t.profile.nameLabel}>
            {({ id }) => (
              <TextInput
                id={id}
                value={name}
                maxLength={60}
                autoComplete="given-name"
                placeholder={t.profile.namePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
        )}
        <div className="mt-5 flex justify-end">
          <Button type="submit" variant="primary" loading={saving} disabled={unchanged}>
            {unchanged ? t.common.saved : t.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function InitialBalanceCard() {
  const { settings, refresh, period, anchor, version } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const summary = useApiResource(
    () => api.getSummary(period, anchor),
    [period, anchor, version],
  );

  const [cents, setCents] = useState(0);
  const [negative, setNegative] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingAccounts, setTogglingAccounts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Só sincroniza quando as configurações chegam do servidor.
  useEffect(() => {
    if (!settings) return;
    setCents(Math.abs(settings.manualInitialBalanceCents));
    setNegative(settings.manualInitialBalanceCents < 0);
  }, [settings]);

  const useAccounts = settings?.useMultipleAccounts ?? false;
  const manualCents = cents * (negative ? -1 : 1);
  const unchanged = settings?.manualInitialBalanceCents === manualCents;

  /** Saldo inicial que vale de fato: soma das contas ou o valor digitado. */
  const effectiveCents = useAccounts ? (settings?.accountsTotalCents ?? 0) : manualCents;

  const projectedBalance =
    summary.data && settings
      ? summary.data.currentBalanceCents - settings.initialBalanceCents + effectiveCents
      : null;

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings({ initialBalanceCents: manualCents });
      notify(t.profile.balanceSaved);
      refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.profile.balanceFailed);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccounts(enabled: boolean): Promise<void> {
    setTogglingAccounts(true);
    try {
      await api.updateSettings({ useMultipleAccounts: enabled });
      refresh();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : t.profile.toggleFailed, 'error');
    } finally {
      setTogglingAccounts(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t.profile.initialBalance}
        description={t.profile.initialBalanceDescription}
      />
      <div className="px-5 pt-5 pb-6 sm:px-6">
        {!settings ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <form onSubmit={handleSubmit}>
            <fieldset disabled={useAccounts} className="transition-opacity disabled:opacity-45">
              <Field
                label={t.profile.amount}
                hint={useAccounts ? t.profile.disabledByAccounts : t.profile.negativeHint}
              >
                {({ id }) => (
                  <div className="flex flex-col gap-3">
                    <CurrencyInput
                      id={id}
                      size="lg"
                      // O sinal de menos entra no prefixo: é a única pista de
                      // que o valor digitado conta como dívida.
                      prefix={negative ? `− ${currencySymbol()}` : undefined}
                      valueCents={cents}
                      onChangeCents={setCents}
                    />
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                      <input
                        type="checkbox"
                        checked={negative}
                        onChange={(event) => setNegative(event.target.checked)}
                        className="size-4 accent-[var(--accent)]"
                      />
                      {t.profile.negativeLabel}
                    </label>
                  </div>
                )}
              </Field>

              {!useAccounts && (
                <div className="mt-5 flex justify-end">
                  <Button type="submit" variant="primary" loading={saving} disabled={unchanged}>
                    {unchanged ? t.common.saved : t.common.save}
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
        )}

        {settings && (
          <div className="mt-6 border-t border-line pt-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={useAccounts}
                disabled={togglingAccounts}
                onChange={(event) => void toggleAccounts(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{t.profile.useAccounts}</span>
                <span className="mt-0.5 block text-[13px] text-ink-3">
                  {t.profile.useAccountsDescription}
                </span>
              </span>
            </label>

            {useAccounts && (
              <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4">
                <AccountsPanel />
              </div>
            )}
          </div>
        )}

        {projectedBalance !== null && (
          <p className="mt-5 rounded-xl bg-surface-inset px-4 py-3 text-[13px] text-ink-2">
            {t.profile.projection(formatCurrency(projectedBalance))}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-expense-soft px-4 py-3 text-[13px] text-expense-text"
          >
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
