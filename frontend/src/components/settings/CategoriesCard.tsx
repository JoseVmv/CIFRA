import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import { Button, IconButton } from '../ui/Button';
import { Field, Select, TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Skeleton } from '../ui/States';
import { IconPencil, IconPlus, IconTrash } from '../ui/Icons';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { useLanguage, useT } from '../../i18n';
import { categoryLabel, collidesWithSuggested } from '../../i18n/categories';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { CashflowType, Category } from '../../types/api';

const MAX_NAME_LENGTH = 40;

/**
 * Gerência das categorias personalizadas.
 *
 * As sugeridas aparecem só para leitura, e de propósito: elas são constantes do
 * código, traduzidas junto com a interface. Deixá-las editáveis significaria
 * gravar o nome traduzido no histórico — e aí a mesma categoria viraria duas
 * fatias no gráfico ao trocar de idioma.
 */
export function CategoriesCard() {
  const { categories, refresh } = useFinance();
  const t = useT();
  const { language } = useLanguage();

  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<Category | null>(null);

  const custom = categories?.custom ?? [];

  /** As sugeridas são o que sobra da lista completa depois de tirar as do usuário. */
  const suggested = useMemo(() => {
    if (!categories) return { income: [] as string[], expense: [] as string[] };
    const mine = new Set(custom.map((category) => `${category.type}:${category.name}`));
    return {
      income: categories.income.filter((name) => !mine.has(`income:${name}`)),
      expense: categories.expense.filter((name) => !mine.has(`expense:${name}`)),
    };
  }, [categories, custom]);

  function openNew(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader
          title={t.categories.title}
          description={t.categories.description}
          action={
            <Button size="sm" variant="secondary" icon={<IconPlus />} onClick={openNew}>
              {t.categories.newButton}
            </Button>
          }
        />

        <div className="flex flex-col gap-6 px-5 pt-5 pb-6 sm:px-6">
          {!categories ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <>
              <section>
                <h3 className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                  {t.categories.yours}
                </h3>
                {custom.length === 0 ? (
                  <p className="mt-2.5 rounded-xl bg-surface-inset px-4 py-3 text-[13px] text-ink-2">
                    {t.categories.none}
                  </p>
                ) : (
                  <ul className="mt-2.5 flex flex-col divide-y divide-line">
                    {custom.map((category) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        onEdit={() => {
                          setEditing(category);
                          setDialogOpen(true);
                        }}
                        onRemove={() => setRemoving(category)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                  {t.categories.suggested}
                </h3>
                <div className="mt-2.5 flex flex-col gap-3">
                  {(['expense', 'income'] as const).map((type) => (
                    <div key={type}>
                      <p className="text-[12px] text-ink-3">
                        {type === 'expense'
                          ? t.categories.expenseSection
                          : t.categories.incomeSection}
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {suggested[type].map((name) => (
                          <li
                            key={name}
                            className="rounded-lg bg-surface-inset px-2.5 py-1 text-[13px] text-ink-2"
                          >
                            {categoryLabel(name, language)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </Card>

      <CategoryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        category={editing}
        onSaved={refresh}
      />

      <RemoveCategoryDialog
        category={removing}
        onClose={() => setRemoving(null)}
        onRemoved={refresh}
      />
    </>
  );
}

function CategoryRow({
  category,
  onEdit,
  onRemove,
}: {
  category: Category;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();

  return (
    <li className="group flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        className={cn(
          'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          category.type === 'income'
            ? 'bg-income-soft text-income-text'
            : 'bg-expense-soft text-expense-text',
        )}
      >
        {category.type === 'income' ? t.categories.incomeSection : t.categories.expenseSection}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{category.name}</span>

      <span className="shrink-0 text-[12px] text-ink-3">
        {t.categories.usage(category.usageCount)}
      </span>

      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <IconButton
          label={t.categories.editLabel(category.name)}
          className="size-8"
          onClick={onEdit}
        >
          <IconPencil />
        </IconButton>
        <IconButton
          label={t.categories.removeLabel(category.name)}
          className="size-8 hover:bg-expense-soft hover:text-expense-text"
          onClick={onRemove}
        >
          <IconTrash />
        </IconButton>
      </div>
    </li>
  );
}

interface CategoryDialogProps {
  open: boolean;
  onClose: () => void;
  /** Quando presente, o diálogo renomeia em vez de criar. */
  category: Category | null;
  onSaved: () => void;
}

function CategoryDialog({ open, onClose, category, onSaved }: CategoryDialogProps) {
  const { categories } = useFinance();
  const { notify } = useToast();
  const t = useT();

  const [name, setName] = useState('');
  const [type, setType] = useState<CashflowType>('expense');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(category);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setType(category?.type ?? 'expense');
    setError(null);
  }, [open, category]);

  const typeOptions: ReadonlyArray<{ value: CashflowType; label: string }> = [
    { value: 'expense', label: t.categories.expenseSection },
    { value: 'income', label: t.categories.incomeSection },
  ];

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError(t.categories.errorName);
      return;
    }

    /**
     * A checagem contra as sugeridas acontece aqui porque só a interface conhece
     * os nomes traduzidos. E ela compara com **todos** os idiomas: quem está no
     * inglês não deve conseguir criar "Comida" e descobrir a duplicata só ao
     * mudar para o espanhol. O servidor ainda barra a colisão com o nome
     * canônico e com as outras personalizadas.
     */
    const suggested = (categories?.[type] ?? []).filter(
      (option) => !categories?.custom.some((c) => c.type === type && c.name === option),
    );
    if (collidesWithSuggested(trimmed, suggested)) {
      setError(t.categories.errorReserved);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (category) {
        await api.renameCategory(category.id, trimmed);
        notify(t.categories.renamed);
      } else {
        await api.createCategory({ name: trimmed, type });
        notify(t.categories.created);
      }
      onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : category
            ? t.categories.saveFailed
            : t.categories.createFailed,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={isEditing ? t.categories.editTitle : t.categories.newTitle}
      description={isEditing ? t.categories.editDescription : t.categories.newDescription}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="category-form" variant="primary" loading={submitting}>
            {isEditing ? t.common.saveChanges : t.common.create}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {/* O tipo é fixo na renomeação: mover uma categoria de saída para entrada
            deixaria o histórico já classificado sem sentido. */}
        {!isEditing && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">{t.categories.typeLabel}</span>
            <SegmentedControl
              ariaLabel={t.categories.typeLabel}
              size="md"
              className="w-full"
              options={typeOptions}
              value={type}
              onChange={setType}
            />
          </div>
        )}

        <Field label={t.categories.nameLabel} error={error ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              placeholder={t.categories.namePlaceholder}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

function RemoveCategoryDialog({
  category,
  onClose,
  onRemoved,
}: {
  category: Category | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { categories } = useFinance();
  const { notify } = useToast();
  const t = useT();
  const { language } = useLanguage();

  const [reassignTo, setReassignTo] = useState('');
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inUse = (category?.usageCount ?? 0) > 0;

  /** Destinos possíveis: qualquer categoria do mesmo tipo, menos ela mesma. */
  const targets = useMemo(() => {
    if (!category || !categories) return [];
    return categories[category.type].filter((name) => name !== category.name);
  }, [category, categories]);

  useEffect(() => {
    if (!category) return;
    setReassignTo(inUse ? (targets[0] ?? '') : '');
    setError(null);
  }, [category, inUse, targets]);

  async function handleRemove(): Promise<void> {
    if (!category) return;
    setRemoving(true);
    setError(null);
    try {
      await api.deleteCategory(category.id, inUse ? reassignTo : undefined);
      notify(t.categories.removed(category.name));
      onRemoved();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.categories.removeFailed);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Modal
      open={Boolean(category)}
      onClose={onClose}
      size="sm"
      title={t.categories.removeTitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={removing}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={handleRemove}
            loading={removing}
            disabled={inUse && !reassignTo}
          >
            {t.common.delete}
          </Button>
        </>
      }
    >
      {category && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-ink-2">
            {inUse
              ? t.categories.removeInUse(category.name, category.usageCount)
              : t.categories.removeEmpty(category.name)}
          </p>

          {inUse && (
            <Field label={t.categories.reassignLabel}>
              {({ id }) => (
                <Select
                  id={id}
                  value={reassignTo}
                  onChange={(event) => setReassignTo(event.target.value)}
                >
                  {targets.map((name) => (
                    <option key={name} value={name}>
                      {categoryLabel(name, language)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-expense-soft px-4 py-3 text-[13px] text-expense-text"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
