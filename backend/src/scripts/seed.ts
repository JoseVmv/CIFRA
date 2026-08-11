/**
 * Popula um banco com dados de demonstração — contas, meses de histórico,
 * recorrências, uma compra parcelada, transferências e limites de gasto.
 *
 *   npm run seed                          → substitui o conteúdo do banco padrão
 *   npm run seed -- --db=data/demo.sqlite → escreve num banco à parte
 *   npm run seed -- --keep                → acrescenta sem apagar o que já existe
 *
 * Para voltar a um app vazio: `npm run db:reset`.
 */
import path from 'node:path';
import { config } from '../config';
import { openDatabase } from '../db/connection';
import { createServices } from '../services';
import { populateDemo } from './demo-data';

/**
 * `--db=caminho` escolhe outro arquivo, deixando o banco de uso diário intacto.
 * Caminhos relativos contam a partir da raiz do projeto — e não de onde o
 * comando foi digitado, que muda conforme o npm resolve o workspace.
 */
function resolveDatabasePath(): string {
  const argumento = process.argv.find((arg) => arg.startsWith('--db='));
  if (!argumento) return config.databasePath;

  const informado = argumento.slice('--db='.length);
  return path.isAbsolute(informado) ? informado : path.join(config.projectRoot, informado);
}

function reais(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function main(): void {
  const keepExisting = process.argv.includes('--keep');
  const databasePath = resolveDatabasePath();
  const db = openDatabase(databasePath);
  const services = createServices(db);

  // Sem `--keep` o banco volta à estaca zero: contas, limites e recorrências
  // antigas sairiam junto com as transações e deixariam a demonstração torta.
  if (!keepExisting) {
    services.maintenance.resetAll();
  }

  const resumo = populateDemo(services);

  console.log(`\n  Demonstração criada em ${databasePath}\n`);
  console.log(`  ${resumo.transactions} transações, cobrindo vários meses`);
  console.log(`  ${resumo.accounts} contas · ${resumo.recurrences} recorrências · ${resumo.budgets} limites`);
  console.log(`  1 compra em ${resumo.installments}x · ${resumo.transfers} transferências`);
  console.log(`  Saldo atual: ${reais(resumo.balanceCents)}\n`);

  db.close();
}

main();
