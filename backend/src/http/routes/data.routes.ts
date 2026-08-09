import { Router } from 'express';
import type { Services } from '../../services';
import { parseOrThrow, resetBodySchema } from '../validation';

export function createDataRouter(services: Services): Router {
  const router = Router();

  /**
   * Apaga transações e configurações. Exige `{ "confirm": "RESETAR" }` no corpo —
   * sem isso a resposta é 422 e nada é tocado.
   */
  router.delete('/data', (req, res) => {
    parseOrThrow(resetBodySchema, req.body);
    const result = services.maintenance.resetAll();
    console.warn(`[reset] ${result.deletedTransactions} transações apagadas a pedido do usuário`);
    res.json(result);
  });

  return router;
}
