/**
 * Popula o banco com dados de demonstração.
 *
 *   npm run seed            → apaga as transações existentes e insere a demonstração
 *   npm run seed -- --keep  → mantém o que já existe e apenas acrescenta
 *
 * Para voltar a um app vazio: `npm run db:reset`.
 */
import { config } from '../config';
import { openDatabase } from '../db/connection';
import { createServices } from '../services';
import { buildDemoTransactions, DEMO_INITIAL_BALANCE_CENTS } from './demo-data';

function main(): void {
  const keepExisting = process.argv.includes('--keep');
  const db = openDatabase(config.databasePath);
  const services = createServices(db);

  if (!keepExisting) {
    db.exec('DELETE FROM transactions');
  }

  const transactions = buildDemoTransactions();

  db.exec('BEGIN');
  try {
    for (const transaction of transactions) {
      services.transactions.create(transaction);
    }
    services.settings.update({ initialBalanceCents: DEMO_INITIAL_BALANCE_CENTS });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const balance = services.analytics.currentBalanceCents();
  console.log(`\n  ${transactions.length} transações de demonstração criadas.`);
  console.log(`  Saldo inicial: R$ ${(DEMO_INITIAL_BALANCE_CENTS / 100).toFixed(2)}`);
  console.log(`  Saldo atual:   R$ ${(balance / 100).toFixed(2)}`);
  console.log(`  Banco:         ${config.databasePath}\n`);

  db.close();
}

main();
