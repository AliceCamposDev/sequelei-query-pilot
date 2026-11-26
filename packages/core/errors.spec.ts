import { describe, expect, it } from 'vitest';

import { InvalidSqlError, SequeleiError, type SequeleiErrorCode } from './errors';

describe('SequeleiError', () => {
  it.each<SequeleiErrorCode>(['EMPTY_SQL', 'INVALID_SQL', 'UNSUPPORTED_COMMAND', 'MALFORMED_SQL'])(
    'instancia erro tipado com código %s',
    (code) => {
      const error = new SequeleiError(code, `Falha para ${code}`);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SequeleiError);
      expect(error.name).toBe('SequeleiError');
      expect(error.code).toBe(code);
      expect(error.message).toBe(`Falha para ${code}`);
    },
  );

  it('InvalidSqlError estende SequeleiError com código padrão INVALID_SQL', () => {
    const defaultError = new InvalidSqlError('SQL inválido');
    expect(defaultError).toBeInstanceOf(SequeleiError);
    expect(defaultError).toBeInstanceOf(InvalidSqlError);
    expect(defaultError.name).toBe('InvalidSqlError');
    expect(defaultError.code).toBe('INVALID_SQL');

    const emptyError = new InvalidSqlError('Vazio', 'EMPTY_SQL');
    expect(emptyError.code).toBe('EMPTY_SQL');
  });
});
