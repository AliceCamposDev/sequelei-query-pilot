export type SequeleiErrorCode =
  'EMPTY_SQL' | 'INVALID_SQL' | 'MALFORMED_SQL' | 'UNSUPPORTED_COMMAND';

/** Erro base tipado do domínio SQL do Sequelei. */
export class SequeleiError extends Error {
  readonly code: SequeleiErrorCode;

  constructor(code: SequeleiErrorCode, message: string) {
    super(message);
    this.name = 'SequeleiError';
    this.code = code;
  }
}

/** Erro lançado quando o SQL de entrada é vazio, inválido ou não suportado. */
export class InvalidSqlError extends SequeleiError {
  constructor(message: string, code: SequeleiErrorCode = 'INVALID_SQL') {
    super(code, message);
    this.name = 'InvalidSqlError';
  }
}
