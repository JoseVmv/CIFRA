import { Router } from 'express';
import { isPeriodKey, resolveRange } from '../../domain/period';
import type { PeriodKey } from '../../domain/types';
import type { Services } from '../../services';
import { normalizeQuery, parseOrThrow, rangeQuerySchema } from '../validation';

function rangeFromQuery(query: unknown) {
  const parsed = parseOrThrow(rangeQuerySchema, normalizeQuery(query));
  const period: PeriodKey =
    parsed.period && isPeriodKey(parsed.period) ? (parsed.period as PeriodKey) : 'month';
  return resolveRange({ period, from: parsed.from, to: parsed.to });
}

export function createAnalyticsRouter(services: Services): Router {
  const router = Router();

  router.get('/summary', (req, res) => {
    res.json(services.analytics.getSummary(rangeFromQuery(req.query)));
  });

  router.get('/statistics', (req, res) => {
    res.json(services.analytics.getStatistics(rangeFromQuery(req.query)));
  });

  return router;
}
