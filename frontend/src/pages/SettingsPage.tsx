import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/AppShell';
import { CategoriesCard } from '../components/settings/CategoriesCard';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, TextInput } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { IconTrash } from '../components/ui/Icons';
import { useFinance } from '../context/FinanceContext';
import { useToast } from '../context/ToastContext';
import { LANGUAGES, LANGUAGE_NAMES, useLanguage, useT, type Language } from '../i18n';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useApiResource } from '../hooks/useApiResource';
import { api, ApiError, RESET_CONFIRMATION } from '../lib/api';
import { CURRENCIES, type Currency } from '../types/api';

export function SettingsPage() {
  const t = useT();

  return (
    <>
      <PageHeader title={t.settings.title} description={t.settings.subtitle} />
      <div className="flex max-w-2xl flex-col gap-4 sm:gap-6">
        <AppearanceCard />
        <LanguageCard />
        <CurrencyCard />
        <CategoriesCard />
        <DataCard />
        <ResetCard />
      </div>
    </>
  );
}

function AppearanceCard() {
  const { theme, toggleTheme } = useTheme();
  const t = useT();

  const themeOptions: ReadonlyArray<{ value: Theme; label: string }> = [
    { value: 'light', label: t.settings.light },
    { value: 'dark', label: t.settings.dark },
  ];

  return (
    <Card>
      <CardHeader title={t.settings.appearance} description={t.settings.appearanceDescription} />
      <div className="px-5 pt-5 pb-6 sm:px-6">
        <SegmentedControl
          ariaLabel={t.settings.themeLabel}
          options={themeOptions}
          value={theme}
          onChange={(next) => {
            if (next !== theme) toggleTheme();
          }}
        />
      </div>
    </Card>
  );
}

/**
 * O idioma vive nos ajustes do servidor, e não no navegador como o tema: assim
 * a escolha feita no computador vale também quando o app é aberto pelo celular.
 * A troca é aplicada na hora e só depois salva — esperar a resposta da rede para
 * ver a interface mudar pareceria travamento.
 */
function LanguageCard() {
  const { refresh } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const { language, setLanguage } = useLanguage();
  const [saving, setSaving] = useState(false);

  async function change(next: Language): Promise<void> {
    if (next === language) return;

    const previous = language;
    setLanguage(next);
    setSaving(true);
    try {
      await api.updateSettings({ language: next });
      refresh();
    } catch (error) {
      setLanguage(previous);
      notify(error instanceof ApiError ? error.message : t.settings.languageFailed, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t.settings.language} description={t.settings.languageDescription} />
      <div className="px-5 pt-5 pb-6 sm:px-6">
        <SegmentedControl
          ariaLabel={t.settings.languageLabel}
          // Cada idioma aparece escrito nele mesmo: é assim que alguém que não
          // entende a língua atual encontra a sua.
          options={LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
          value={language}
          onChange={(next) => void change(next)}
          disabled={saving}
        />
      </div>
    </Card>
  );
}

/**
 * Moeda de exibição. Segue o mesmo caminho do idioma — troca local imediata,
 * gravação depois — e traz um aviso explícito de que nada é convertido: quem lê
 * "US$" onde antes lia "R$" precisa saber que o número por trás não mudou.
 */
function CurrencyCard() {
  const { refresh } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const { currency, setCurrency } = useLanguage();
  const [saving, setSaving] = useState(false);

  async function change(next: Currency): Promise<void> {
    if (next === currency) return;

    const previous = currency;
    setCurrency(next);
    setSaving(true);
    try {
      await api.updateSettings({ currency: next });
      refresh();
    } catch (error) {
      setCurrency(previous);
      notify(error instanceof ApiError ? error.message : t.settings.currencyFailed, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t.settings.currency} description={t.settings.currencyDescription} />
      {/* `items-start` para o seletor não esticar na largura do card: numa coluna
          flex os filhos crescem por padrão, e ele ficaria diferente dos outros. */}
      <div className="flex flex-col items-start gap-4 px-5 pt-5 pb-6 sm:px-6">
        <SegmentedControl
          ariaLabel={t.settings.currencyLabel}
          options={CURRENCIES.map((value) => ({ value, label: t.currencies[value] }))}
          value={currency}
          onChange={(next) => void change(next)}
          disabled={saving}
        />
        <p className="rounded-xl bg-surface-inset px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          {t.settings.currencyNote}
        </p>
      </div>
    </Card>
  );
}

function DataCard() {
  const t = useT();

  return (
    <Card>
      <CardHeader title={t.settings.dataTitle} description={t.settings.dataDescription} />
      <div className="space-y-3 px-5 pt-5 pb-6 text-[13px] leading-relaxed text-ink-2 sm:px-6">
        <p>
          {t.settings.dataWhere}{' '}
          <code className="rounded bg-surface-inset px-1.5 py-0.5">data/finance.sqlite</code>
          {t.settings.dataWhereEnd}
        </p>
        <p>
          {t.settings.dataSeed}{' '}
          <code className="rounded bg-surface-inset px-1.5 py-0.5">npm run seed</code>{' '}
          {t.settings.dataSeedEnd}
        </p>
        <p>
          {t.settings.dataBalance}{' '}
          <Link to="/usuario" className="font-medium text-accent underline-offset-4 hover:underline">
            {t.nav.profile}
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
  const t = useT();

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
          ? t.settings.resetDoneCount(result.deletedTransactions)
          : t.settings.resetDone,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.settings.resetFailed);
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <Card className="border-expense/30">
        <CardHeader title={t.settings.resetTitle} description={t.settings.resetDescription} />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-6 sm:px-6">
          <p className="text-[13px] text-ink-3">
            {transactions.isInitialLoading
              ? t.settings.resetChecking
              : total === 0
                ? t.settings.resetNothing
                : t.settings.resetCount(total)}
          </p>
          <Button variant="danger" icon={<IconTrash />} onClick={openDialog}>
            {t.settings.resetButton}
          </Button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={t.settings.resetDialogTitle}
        description={t.settings.resetDialogDescription}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={resetting}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" onClick={handleReset} loading={resetting} disabled={!canReset}>
              {t.settings.resetConfirm}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ul className="space-y-1.5 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
            <li>
              <strong className="font-semibold text-ink">{total}</strong>{' '}
              {t.settings.resetItemTransactions(total)} {t.settings.resetItemHistory}
            </li>
            <li>{t.settings.resetItemAccounts}</li>
            <li>{t.settings.resetItemCategories}</li>
            <li>{t.settings.resetItemBalance}</li>
          </ul>

          <Field label={t.settings.resetConfirmLabel(RESET_CONFIRMATION)} error={error ?? undefined}>
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
