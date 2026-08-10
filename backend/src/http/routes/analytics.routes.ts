import { Router } from 'express';
import { isPeriodKey, previousRange, resolveRange } from '../../domain/period';
import type { PeriodKey } from '../../domain/types';
import type { Services } from '../../services';
import { normalizeQuery, parseOrThrow, rangeQuerySchema } from '../validation';

interface ParsedRange {
  period: PeriodKey;
  reference: string | undefined;
  range: ReturnType<typeof resolveRange>;
}

function rangeFromQuery(query: unknown): ParsedRange {
  const parsed = parseOrThrow(rangeQuerySchema, normalizeQuery(query));
  const period: PeriodKey =
    parsed.period && isPeriodKey(parsed.period) ? (parsed.period as PeriodKey) : 'month';

  return {
    period,
    reference: parsed.reference,
    range: resolveRange({ period, reference: parsed.reference, from: parsed.from, to: parsed.to }),
  };
}

export function createAnalyticsRouter(services: Services): Router {
  const router = Router();

  router.get('/summary', (req, res) => {
    res.json(services.analytics.getSummary(rangeFromQuery(req.query).range));
  });

  router.get('/statistics', (req, res) => {
    const { period, reference, range } = rangeFromQuery(req.query);
    // O comparativo só existe para períodos fechados; "Tudo" não tem anterior.
    const previous = range.period === 'custom' ? null : previousRange({ period, reference });
    res.json(services.analytics.getStatistics(range, previous));
  });

  return router;
}
