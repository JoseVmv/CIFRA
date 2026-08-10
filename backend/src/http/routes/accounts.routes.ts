import { Router } from 'express';
import { AppError } from '../../errors';
import { MAX_ACCOUNTS } from '../../services/accounts.service';
import type { Services } from '../../services';
import { accountBodySchema, idParamSchema, parseOrThrow } from '../validation';

export function createAccountsRouter(services: Services): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const items = services.accounts.list();
    res.json({ items, totalCents: services.accounts.totalBalanceCents() });
  });

  router.post('/', (req, res) => {
    if (services.accounts.count() >= MAX_ACCOUNTS) {
      throw new AppError(
        409,
        'TOO_MANY_ACCOUNTS',
        `Você já tem ${MAX_ACCOUNTS} contas — o limite por enquanto.`,
      );
    }
    const body = parseOrThrow(accountBodySchema, req.body);
    res.status(201).json(services.accounts.create(body));
  });

  router.put('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const body = parseOrThrow(accountBodySchema, req.body);
    res.json(services.accounts.update(id, body));
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    services.accounts.remove(id);
    res.status(204).end();
  });

  return router;
}
