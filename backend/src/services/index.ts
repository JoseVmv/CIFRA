import type { DatabaseSync } from 'node:sqlite';
import { createAccountsService, type AccountsService } from './accounts.service';
import { createAnalyticsService, type AnalyticsService } from './analytics.service';
import { createBudgetsService, type BudgetsService } from './budgets.service';
import { createMaintenanceService, type MaintenanceService } from './maintenance.service';
import { createRecurrencesService, type RecurrencesService } from './recurrences.service';
import { createSettingsService, type SettingsService } from './settings.service';
import { createTransactionsService, type TransactionsService } from './transactions.service';

export interface Services {
  db: DatabaseSync;
  accounts: AccountsService;
  settings: SettingsService;
  transactions: TransactionsService;
  recurrences: RecurrencesService;
  analytics: AnalyticsService;
  budgets: BudgetsService;
  maintenance: MaintenanceService;
}

/**
 * Monta os serviços em cima de uma conexão. Receber o `db` por parâmetro (em vez
 * de um singleton global) é o que permite aos testes rodarem em `:memory:`.
 */
export function createServices(db: DatabaseSync): Services {
  const accounts = createAccountsService(db);
  const settings = createSettingsService(db, accounts);
  const transactions = createTransactionsService(db);
  const recurrences = createRecurrencesService(db, transactions);
  const analytics = createAnalyticsService(db, settings, transactions, recurrences);
  const budgets = createBudgetsService(db);
  const maintenance = createMaintenanceService(db);
  return { db, accounts, settings, transactions, recurrences, analytics, budgets, maintenance };
}
