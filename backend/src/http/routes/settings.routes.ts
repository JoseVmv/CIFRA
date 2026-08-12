import { Router } from 'express';
import type { Services } from '../../services';
import { parseOrThrow, settingsBodySchema } from '../validation';

export function createSettingsRouter(services: Services): Router {
  const router = Router();

  router.get('/settings', (_req, res) => {
    res.json(services.settings.get());
  });

  router.put('/settings', (req, res) => {
    const body = parseOrThrow(settingsBodySchema, req.body);
    res.json(services.settings.update(body));
  });

  return router;
}
