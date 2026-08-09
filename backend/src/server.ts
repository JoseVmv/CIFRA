import { createApp } from './app';
import { config } from './config';
import { openDatabase } from './db/connection';
import { createServices } from './services';

function start(): void {
  const db = openDatabase(config.databasePath);
  const services = createServices(db);
  const app = createApp(services);

  const server = app.listen(config.port, config.host, () => {
    console.log(`\n  CIFRA API  →  http://${config.host}:${config.port}/api`);
    console.log(`  Banco      →  ${config.databasePath}`);
    console.log(`  Ambiente   →  ${config.nodeEnv}\n`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `\n  A porta ${config.port} já está em uso.` +
          `\n  Feche o outro processo ou rode com outra porta: PORT=4001 npm run dev\n`,
      );
      process.exit(1);
    }
    throw error;
  });

  const shutdown = (): void => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
