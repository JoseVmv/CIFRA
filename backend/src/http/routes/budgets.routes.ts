import { Router } from 'express';
import type { Services } from '../../services';
import {
  budgetBodySchema,
  idParamSchema,
  normalizeQuery,
  parseOrThrow,
  referenceQuerySchema,
} from '../validation';

export function createBudgetsRouter(services: Services): Router {
  const router = Router();

  /** Cada limite já vem com o consumo calculado na janela do mês de referência. */
  router.get('/', (req, res) => {
    const { reference } = parseOrThrow(referenceQuerySchema, normalizeQuery(req.query));
    res.json({ items: services.budgets.listWithUsage(reference) });
  });

  router.post('/', (req, res) => {
    const body = parseOrThrow(budgetBodySchema, req.body);
    res.status(201).json(services.budgets.create(body));
  });

  router.put('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const body = parseOrThrow(budgetBodySchema, req.body);
    res.json(services.budgets.update(id, body));
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    services.budgets.remove(id);
    res.status(204).end();
  });

  return router;
}
