/**
 * Apaga o banco por completo (transações + configurações) e recria o schema vazio.
 *
 *   npm run db:reset
 */
import fs from 'node:fs';
import { config } from '../config';
import { openDatabase } from '../db/connection';

function main(): void {
  const files = [
    config.databasePath,
    `${config.databasePath}-wal`,
    `${config.databasePath}-shm`,
    `${config.databasePath}-journal`,
  ];

  let removed = 0;
  for (const file of files) {
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      removed += 1;
    }
  }

  // Recria o arquivo já com o schema aplicado, para o app subir limpo.
  openDatabase(config.databasePath).close();

  console.log(
    removed > 0
      ? `\n  Banco apagado e recriado vazio: ${config.databasePath}\n`
      : `\n  Nenhum banco existia. Um banco vazio foi criado: ${config.databasePath}\n`,
  );
}

main();
