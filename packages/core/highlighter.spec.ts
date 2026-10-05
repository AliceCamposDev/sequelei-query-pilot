import { describe, expect, it } from 'vitest';

import { FUNCS, KEYWORDS, TYPES, tokenize } from './highlighter';

describe('tokenize', () => {
  it('exporta os conjuntos de keywords, funções e tipos', () => {
    expect(KEYWORDS.has('select')).toBe(true);
    expect(FUNCS.has('count')).toBe(true);
    expect(TYPES.has('varchar')).toBe(true);
  });

  it('classifica keywords sem diferenciar maiúsculas e minúsculas', () => {
    expect(tokenize('SELECT FROM where').map((token) => token.kind)).toEqual([
      'keyword',
      'keyword',
      'keyword',
    ]);
  });

  it('classifica strings com escape de aspas simples', () => {
    const tokens = tokenize("select 'O''Brien'");

    expect(tokens[1]).toMatchObject({ kind: 'string', text: "'O''Brien'" });
  });

  it('classifica números inteiros, decimais e negativos', () => {
    expect(tokenize('select -10, 3.14, 42').map((token) => token.kind)).toEqual([
      'keyword',
      'number',
      'operator',
      'number',
      'operator',
      'number',
    ]);
  });

  it('classifica funções nativas e funções definidas pelo usuário', () => {
    expect(tokenize('count(id), dbo minha_funcao(value)').map((token) => token.kind)).toContain(
      'function',
    );
    expect(
      tokenize('count(id), minha_funcao(value)').filter((token) => token.kind === 'function'),
    ).toHaveLength(2);
  });

  it('classifica comentários de linha e bloco', () => {
    expect(tokenize('-- select\n/* from */ select').map((token) => token.kind)).toEqual([
      'comment',
      'comment',
      'keyword',
    ]);
  });

  it('classifica operadores, identificadores, nolock e tipos', () => {
    const tokens = tokenize('dbo.users id >= 10 with (nolock) varchar');

    expect(tokens.map((token) => token.kind)).toEqual([
      'identifier',
      'identifier',
      'operator',
      'number',
      'keyword',
      'operator',
      'nolock',
      'operator',
      'type',
    ]);
  });

  it('não interpreta tokens dentro de strings ou comentários', () => {
    const tokens = tokenize("'select count(1)' -- where int\nselect");

    expect(tokens.map((token) => token.kind)).toEqual(['string', 'comment', 'keyword']);
  });

  it('processa 1.000 linhas de SQL em menos de 200ms', () => {
    const sql = Array.from({ length: 1000 }, (_, index) => `select ${index} from dbo.users`).join(
      '\n',
    );
    const startedAt = performance.now();

    tokenize(sql);

    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
