import { Router } from 'express';
import type { Services } from '../../services';
import { catchUpRecurrences } from '../middleware/recurrences';
import { createAccountsRouter } from './accounts.routes';
import { createAnalyticsRouter } from './analytics.routes';
import { createBudgetsRouter } from './budgets.routes';
import { createCategoriesRouter } from './categories.routes';
import { createDataRouter } from './data.routes';
import { createRecurrencesRouter } from './recurrences.routes';
import { createSettingsRouter } from './settings.routes';
import { createTransactionsRouter } from './transactions.routes';

export function createApiRouter(services: Services): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  // Qualquer uso do app é uma "entrada": é aqui que as recorrências vencidas
  // viram lançamentos, antes de qualquer leitura enxergar o banco.
  router.use(catchUpRecurrences(services));

  router.use('/transactions', createTransactionsRouter(services));
  router.use('/accounts', createAccountsRouter(services));
  router.use('/budgets', createBudgetsRouter(services));
  router.use('/categories', createCategoriesRouter(services));
  router.use('/recurrences', createRecurrencesRouter(services));
  router.use(createAnalyticsRouter(services));
  router.use(createSettingsRouter(services));
  router.use(createDataRouter(services));

  return router;
}
