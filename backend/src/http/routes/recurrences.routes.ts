import { Router } from 'express';
import type { Services } from '../../services';
import { idParamSchema, parseOrThrow, recurrenceBodySchema } from '../validation';

export function createRecurrencesRouter(services: Services): Router {
  const router = Router();

  /** Cada regra já vem com a próxima data prevista. */
  router.get('/', (_req, res) => {
    res.json({ items: services.recurrences.list() });
  });

  router.post('/', (req, res) => {
    const body = parseOrThrow(recurrenceBodySchema, req.body);
    res.status(201).json(services.recurrences.create(body));
  });

  router.put('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const body = parseOrThrow(recurrenceBodySchema, req.body);
    res.json(services.recurrences.update(id, body));
  });

  /** Remove só a regra — os lançamentos que ela já criou continuam no histórico. */
  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    services.recurrences.remove(id);
    res.status(204).end();
  });

  return router;
}
