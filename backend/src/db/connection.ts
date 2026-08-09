import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations';

/**
 * Abre (criando, se preciso) o banco SQLite e aplica as migrations.
 * Use `':memory:'` para bancos efêmeros — é o que os testes fazem.
 */
export function openDatabase(filePath: string): DatabaseSync {
  const inMemory = filePath === ':memory:';

  if (!inMemory) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const db = new DatabaseSync(filePath);

  if (!inMemory) {
    // WAL deixa leitura e escrita simultâneas bem mais rápidas em arquivo.
    db.exec('PRAGMA journal_mode = WAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  runMigrations(db);
  return db;
}
