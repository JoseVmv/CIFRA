/**
 * Erro de aplicação: carrega um status HTTP e uma mensagem já pronta para o
 * usuário final. Qualquer outro erro que chegue ao handler vira um 500 genérico
 * (sem vazar stack trace).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Registro não encontrado.') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos.', details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

/**
 * A operação é válida, mas esbarra no estado atual — apagar uma categoria que
 * ainda tem lançamentos, por exemplo. Os `details` dizem o que trava, para a
 * interface poder oferecer a saída em vez de só recusar.
 */
export class ConflictError extends AppError {
  constructor(message = 'Operação em conflito com os dados atuais.', details?: unknown) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}
