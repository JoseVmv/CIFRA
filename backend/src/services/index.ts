import type { DatabaseSync } from 'node:sqlite';
import { createAnalyticsService, type AnalyticsService } from './analytics.service';
import { createMaintenanceService, type MaintenanceService } from './maintenance.service';
import { createSettingsService, type SettingsService } from './settings.service';
import { createTransactionsService, type TransactionsService } from './transactions.service';

export interface Services {
  db: DatabaseSync;
  settings: SettingsService;
  transactions: TransactionsService;
  analytics: AnalyticsService;
  maintenance: MaintenanceService;
}

/**
 * Monta os serviços em cima de uma conexão. Receber o `db` por parâmetro (em vez
 * de um singleton global) é o que permite aos testes rodarem em `:memory:`.
 */
export function createServices(db: DatabaseSync): Services {
  const settings = createSettingsService(db);
  const transactions = createTransactionsService(db);
  const analytics = createAnalyticsService(db, settings, transactions);
  const maintenance = createMaintenanceService(db);
  return { db, settings, transactions, analytics, maintenance };
}
