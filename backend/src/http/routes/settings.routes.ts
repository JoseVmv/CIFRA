import { Router } from 'express';
import { DEFAULT_CATEGORIES } from '../../domain/categories';
import type { CashflowType } from '../../domain/types';
import type { Services } from '../../services';
import { parseOrThrow, settingsBodySchema } from '../validation';

export function createSettingsRouter(services: Services): Router {
  const router = Router();

  router.get('/settings', (_req, res) => {
    res.json(services.settings.get());
  });

  router.put('/settings', (req, res) => {
    const body = parseOrThrow(settingsBodySchema, req.body);
    res.json(services.settings.update(body));
  });

  /** Categorias padrão + as que o usuário já criou, sem duplicatas. */
  router.get('/categories', (_req, res) => {
    const used = services.transactions.categoriesInUse();
    const merge = (type: CashflowType): string[] => {
      const seen = new Set<string>(DEFAULT_CATEGORIES[type]);
      for (const entry of used) {
        if (entry.type === type) seen.add(entry.category);
      }
      return [...seen];
    };
    res.json({ income: merge('income'), expense: merge('expense') });
  });

  return router;
}
