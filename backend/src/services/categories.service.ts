import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import {
  TRANSFER_CATEGORY,
  type CashflowType,
  type CategoriesResponse,
  type Category,
  type CategoryInput,
} from '../domain/types';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

interface CategoryRow {
  id: string;
  name: string;
  type: CashflowType;
  position: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

/** Trava defensiva: uma lista maior que isso deixa de ajudar a classificar. */
export const MAX_CUSTOM_CATEGORIES = 60;

/**
 * Quantos registros carregam este nome hoje. Transferências ficam de fora: a
 * categoria delas é fixa e não é gerenciável.
 */
const USAGE_COUNT = `
  COALESCE((
    SELECT COUNT(*) FROM transactions t
     WHERE t.category = c.name AND t.type = c.type
  ), 0)
  + COALESCE((
      SELECT COUNT(*) FROM recurrences r
       WHERE r.category = c.name AND r.type = c.type
    ), 0) AS usage_count`;

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    position: row.position,
    usageCount: row.usage_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CategoriesService = ReturnType<typeof createCategoriesService>;

export function createCategoriesService(db: DatabaseSync) {
  const selectAll = db.prepare(
    `SELECT c.*, ${USAGE_COUNT} FROM custom_categories c
      ORDER BY c.type ASC, c.position ASC, c.created_at ASC`,
  );
  const selectById = db.prepare(`SELECT c.*, ${USAGE_COUNT} FROM custom_categories c WHERE c.id = ?`);
  const insert = db.prepare(
    `INSERT INTO custom_categories (id, name, type, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const renameStatement = db.prepare(
    'UPDATE custom_categories SET name = ?, updated_at = ? WHERE id = ?',
  );
  const deleteStatement = db.prepare('DELETE FROM custom_categories WHERE id = ?');

  /**
   * Comparação de nomes de categoria: sem espaços nas pontas e sem caixa.
   * "  pets " e "Pets" são a mesma coisa para quem está classificando um gasto.
   */
  function normalize(name: string): string {
    return name.trim().toLocaleLowerCase('pt-BR');
  }

  function isSuggested(name: string, type: CashflowType): boolean {
    const target = normalize(name);
    return DEFAULT_CATEGORIES[type].some((suggested) => normalize(suggested) === target);
  }

  function listCustom(): Category[] {
    return (selectAll.all() as unknown as CategoryRow[]).map(toCategory);
  }

  function getById(id: string): Category {
    const row = selectById.get(id) as CategoryRow | undefined;
    if (!row) throw new NotFoundError('Categoria não encontrada.');
    return toCategory(row);
  }

  /** As sugeridas primeiro, na ordem do código; depois as do usuário. */
  function list(): CategoriesResponse {
    const custom = listCustom();
    const namesOf = (type: CashflowType): string[] => [
      ...DEFAULT_CATEGORIES[type],
      ...custom.filter((category) => category.type === type).map((category) => category.name),
    ];
    return { income: namesOf('income'), expense: namesOf('expense'), custom };
  }

  /**
   * Recusa um nome já ocupado — por uma sugerida ou por outra personalizada.
   *
   * A checagem contra as sugeridas usa o nome canônico (o que vai para o banco).
   * A interface faz a mesma checagem contra os nomes *traduzidos*, que só ela
   * conhece: é o que evita alguém no inglês criar "Food" ao lado da sugerida
   * "Alimentação", que aparece como "Food" naquele idioma.
   */
  function assertNameIsFree(name: string, type: CashflowType, exceptId?: string): void {
    if (normalize(name) === normalize(TRANSFER_CATEGORY)) {
      throw new ValidationError('Esse nome é reservado às transferências.');
    }
    if (isSuggested(name, type)) {
      throw new ValidationError('Já existe uma categoria sugerida com esse nome.');
    }
    const taken = listCustom().some(
      (category) =>
        category.type === type &&
        category.id !== exceptId &&
        normalize(category.name) === normalize(name),
    );
    if (taken) {
      throw new ValidationError('Você já tem uma categoria com esse nome.');
    }
  }

  function create(input: CategoryInput): Category {
    const name = input.name.trim();
    assertNameIsFree(name, input.type);

    const total = (
      db.prepare('SELECT COUNT(*) AS total FROM custom_categories').get() as { total: number }
    ).total;
    if (total >= MAX_CUSTOM_CATEGORIES) {
      throw new ValidationError(
        `Você já tem ${MAX_CUSTOM_CATEGORIES} categorias personalizadas — apague alguma antes de criar outra.`,
      );
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const nextPosition = (
      db
        .prepare(
          'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM custom_categories WHERE type = ?',
        )
        .get(input.type) as { next: number }
    ).next;

    insert.run(id, name, input.type, nextPosition, now, now);
    return getById(id);
  }

  /**
   * Renomeia e arrasta o histórico junto.
   *
   * Como o nome é o que fica gravado em cada lançamento, deixar o histórico para
   * trás partiria a categoria em duas no gráfico — exatamente o que a tela de
   * categorias existe para evitar. O tipo não muda: mover uma categoria de saída
   * para entrada não teria o que fazer com os lançamentos já classificados.
   */
  function rename(id: string, name: string): Category {
    const current = getById(id);
    const trimmed = name.trim();
    if (normalize(trimmed) !== normalize(current.name)) {
      assertNameIsFree(trimmed, current.type, id);
    }

    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      renameStatement.run(trimmed, now, id);
      db.prepare('UPDATE transactions SET category = ?, updated_at = ? WHERE category = ? AND type = ?')
        .run(trimmed, now, current.name, current.type);
      db.prepare('UPDATE recurrences SET category = ?, updated_at = ? WHERE category = ? AND type = ?')
        .run(trimmed, now, current.name, current.type);
      // Limites de gasto só existem para saída, e o nome ali também é a chave.
      if (current.type === 'expense') {
        db.prepare('UPDATE budgets SET category = ?, updated_at = ? WHERE category = ?')
          .run(trimmed, now, current.name);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return getById(id);
  }

  /**
   * Apaga a categoria. Se ela ainda classifica alguma coisa, exige um destino:
   * apagar em silêncio deixaria lançamentos apontando para um nome que sumiu da
   * lista, e ninguém quer descobrir isso pelo gráfico.
   */
  function remove(id: string, reassignTo?: string): void {
    const category = getById(id);

    if (category.usageCount > 0 && !reassignTo) {
      throw new ConflictError(
        'Esta categoria ainda está em uso. Escolha para onde mover os lançamentos.',
        { usageCount: category.usageCount },
      );
    }

    const target = reassignTo?.trim();
    if (target) {
      const available = category.type === 'income' ? list().income : list().expense;
      const match = available.find(
        (name) => normalize(name) === normalize(target) && normalize(name) !== normalize(category.name),
      );
      if (!match) {
        throw new ValidationError('Escolha uma categoria de destino válida.');
      }

      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE transactions SET category = ?, updated_at = ? WHERE category = ? AND type = ?')
          .run(match, now, category.name, category.type);
        db.prepare('UPDATE recurrences SET category = ?, updated_at = ? WHERE category = ? AND type = ?')
          .run(match, now, category.name, category.type);
        // O destino pode já ter um limite de gasto, e `budgets.category` é único:
        // nesse caso o limite da categoria que sai simplesmente deixa de existir.
        if (category.type === 'expense') {
          const occupied = db
            .prepare('SELECT 1 FROM budgets WHERE category = ?')
            .get(match) as unknown;
          if (occupied) {
            db.prepare('DELETE FROM budgets WHERE category = ?').run(category.name);
          } else {
            db.prepare('UPDATE budgets SET category = ?, updated_at = ? WHERE category = ?')
              .run(match, now, category.name);
          }
        }
        deleteStatement.run(id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return;
    }

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM budgets WHERE category = ?').run(category.name);
      deleteStatement.run(id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return { list, listCustom, getById, create, rename, remove };
}
