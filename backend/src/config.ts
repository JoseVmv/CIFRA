import path from 'node:path';

/**
 * `__dirname` aponta para `backend/src` em desenvolvimento (tsx) e para
 * `backend/dist` em produção — os dois estão um nível abaixo de `backend/`,
 * então a raiz do projeto é sempre dois níveis acima.
 */
const projectRoot = path.resolve(__dirname, '..', '..');

/** Carrega variáveis de um `.env` na raiz, se existir (recurso nativo do Node). */
function loadEnvFile(): void {
  try {
    process.loadEnvFile(path.join(projectRoot, '.env'));
  } catch {
    // Nenhum .env encontrado: seguimos com os valores padrão.
  }
}

loadEnvFile();

function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

export const config = {
  projectRoot,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  host: process.env.HOST ?? '127.0.0.1',
  port: readPort(process.env.PORT, 4000),
  /** Arquivo SQLite. Tudo do app vive aqui. */
  databasePath: process.env.DATABASE_PATH ?? path.join(projectRoot, 'data', 'finance.sqlite'),
  /** Build do frontend, servido pelo backend em produção (`npm run build && npm start`). */
  frontendDistPath: path.join(projectRoot, 'frontend', 'dist'),
} as const;
