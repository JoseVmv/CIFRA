import type { RequestHandler } from 'express';
import { today } from '../../domain/dates';
import type { Services } from '../../services';

/**
 * "Ao entrar": antes de responder qualquer coisa, as recorrências vencidas viram
 * transações de verdade. Como o app é local e sempre passa por aqui, isso faz as
 * vezes de agendador — sem processo em segundo plano nem cron.
 *
 * Roda no máximo uma vez por dia por processo; nos outros pedidos é só uma
 * comparação de strings. Se falhar, o app continua respondendo: um lançamento
 * automático atrasado é melhor do que um app fora do ar.
 */
export function catchUpRecurrences(services: Services): RequestHandler {
  let consideredDay: string | null = null;

  return (_req, _res, next) => {
    const reference = today();
    if (consideredDay !== reference) {
      consideredDay = reference;
      try {
        services.recurrences.catchUp(reference);
      } catch (error) {
        console.error('[recorrências] não foi possível lançar as pendências', error);
      }
    }
    next();
  };
}
