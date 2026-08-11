import { Router } from 'express';
import { resolveRange, isPeriodKey } from '../../domain/period';
import type { PeriodKey, TransactionFilters } from '../../domain/types';
import type { Services } from '../../services';
import {
  deleteQuerySchema,
  idParamSchema,
  installmentBodySchema,
  listQuerySchema,
  normalizeQuery,
  parseOrThrow,
  transactionBodySchema,
} from '../validation';

export function createTransactionsRouter(services: Services): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const query = parseOrThrow(listQuerySchema, normalizeQuery(req.query));

    // Sem período nem intervalo explícito o histórico mostra tudo.
    let from: string | null = query.from ?? null;
    let to: string | null = query.to ?? null;
    if (!query.from && !query.to && query.period && isPeriodKey(query.period)) {
      const range = resolveRange({
        period: query.period as PeriodKey,
        reference: query.reference,
      });
      from = range.from;
      to = range.to;
    }

    const filters: TransactionFilters = {
      search: query.search,
      category: query.category,
      type: query.type,
      accountId: query.accountId,
      from,
      to,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
    };

    res.json(services.transactions.list(filters));
  });

  router.get('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json(services.transactions.getById(id));
  });

  router.post('/', (req, res) => {
    const body = parseOrThrow(transactionBodySchema, req.body);
    res.status(201).json(services.transactions.create(body));
  });

  /** Compra parcelada: cria todas as parcelas de uma vez. */
  router.post('/installments', (req, res) => {
    const body = parseOrThrow(installmentBodySchema, req.body);
    const items = services.transactions.createInstallments(body);
    res.status(201).json({ items });
  });

  router.put('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const body = parseOrThrow(transactionBodySchema, req.body);
    res.json(services.transactions.update(id, body));
  });

  /** `?scope=installments` apaga a compra parcelada inteira, não só esta parcela. */
  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const { scope } = parseOrThrow(deleteQuerySchema, normalizeQuery(req.query));

    if (scope === 'installments') {
      res.json({ deleted: services.transactions.removeInstallmentGroup(id) });
      return;
    }

    services.transactions.remove(id);
    res.status(204).end();
  });

  return router;
}
