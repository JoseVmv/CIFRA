import { Router } from 'express';
import type { Services } from '../../services';
import {
  categoryBodySchema,
  categoryDeleteQuerySchema,
  categoryRenameSchema,
  idParamSchema,
  normalizeQuery,
  parseOrThrow,
} from '../validation';

/** `name` também é campo de conta; aqui a mensagem precisa falar de categoria. */
const CATEGORY_MESSAGES = {
  name: 'Dê um nome à categoria, com até 40 caracteres.',
  type: 'Escolha se a categoria é de entrada ou de saída.',
};

export function createCategoriesRouter(services: Services): Router {
  const router = Router();

  /** Sugeridas + personalizadas, prontas para os seletores. */
  router.get('/', (_req, res) => {
    res.json(services.categories.list());
  });

  router.post('/', (req, res) => {
    const body = parseOrThrow(categoryBodySchema, req.body, CATEGORY_MESSAGES);
    res.status(201).json(services.categories.create(body));
  });

  /** Só o nome muda: trocar o tipo deixaria o histórico já classificado sem sentido. */
  router.put('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const { name } = parseOrThrow(categoryRenameSchema, req.body, CATEGORY_MESSAGES);
    res.json(services.categories.rename(id, name));
  });

  /** `?reassignTo=Outros` move o que estava classificado antes de apagar. */
  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const { reassignTo } = parseOrThrow(categoryDeleteQuerySchema, normalizeQuery(req.query));
    services.categories.remove(id, reassignTo);
    res.status(204).end();
  });

  return router;
}
