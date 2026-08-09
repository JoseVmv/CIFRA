import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../../errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Rota não encontrada: ${req.method} ${req.path}`,
    },
  });
};

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

/**
 * Converte qualquer erro numa resposta JSON consistente.
 * Erros inesperados nunca vazam mensagem interna nem stack trace para o cliente —
 * apenas para o log do servidor.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  const parseError = error as BodyParserError;
  if (parseError?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' },
    });
    return;
  }
  if (parseError?.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Os dados enviados são grandes demais.' },
    });
    return;
  }

  console.error('[erro não tratado]', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro inesperado no servidor. Tente novamente.',
    },
  });
};
