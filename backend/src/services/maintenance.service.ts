import type { DatabaseSync } from 'node:sqlite';

/** Palavra que o cliente precisa enviar para confirmar um reset. */
export const RESET_CONFIRMATION = 'RESETAR';

export interface ResetResult {
  deletedTransactions: number;
  deletedAccounts: number;
  clearedSettings: boolean;
}

export type MaintenanceService = ReturnType<typeof createMaintenanceService>;

export function createMaintenanceService(db: DatabaseSync) {
  /**
   * Apaga tudo — transações, contas e configurações — numa única transação.
   * O schema permanece; o app volta ao estado de primeira execução.
   */
  function resetAll(): ResetResult {
    db.exec('BEGIN');
    try {
      const transactions = db.prepare('DELETE FROM transactions').run();
      const accounts = db.prepare('DELETE FROM accounts').run();
      const settings = db.prepare('DELETE FROM settings').run();
      db.exec('COMMIT');
      return {
        deletedTransactions: Number(transactions.changes),
        deletedAccounts: Number(accounts.changes),
        clearedSettings: Number(settings.changes) > 0,
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return { resetAll };
}
