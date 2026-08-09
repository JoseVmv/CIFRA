import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import { config } from './config';
import { errorHandler, notFoundHandler } from './http/middleware/errorHandler';
import { createApiRouter } from './http/routes';
import type { Services } from './services';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Por padrão só aceitamos chamadas vindas da própria máquina. */
function corsOptions(): cors.CorsOptions {
  const configured = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true); // mesma origem, curl, etc.
      if (configured.length > 0) return callback(null, configured.includes(origin));
      return callback(null, LOCALHOST_ORIGIN.test(origin));
    },
  };
}

export function createApp(services: Services): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', createApiRouter(services));
  app.use('/api', notFoundHandler);

  // Em produção (`npm run build && npm start`) o backend serve o frontend
  // compilado, então a aplicação inteira roda numa única porta.
  const indexHtml = path.join(config.frontendDistPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.frontendDistPath, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);

  return app;
}
