import { describe, expect, it } from 'vitest';

import { InvalidSqlError, classifyCommand, stripLeadingComments } from './command-classifier';

describe('stripLeadingComments', () => {
  it('remove comentários de linha no início', () => {
    expect(stripLeadingComments('-- explicação\nselect 1')).toBe('select 1');
  });

  it('remove comentários de bloco no início', () => {
    expect(stripLeadingComments('/* explicação */ select 1')).toBe('select 1');
  });

  it('trata comentário de bloco sem fechamento como entrada vazia', () => {
    expect(stripLeadingComments('/* explicação')).toBe('');
  });

  it('remove múltiplos comentários e espaços iniciais', () => {
    expect(stripLeadingComments(' /* um */\n-- dois\n  select 1')).toBe('select 1');
  });
});

describe('classifyCommand', () => {
  it.each([
    ['select * from users', 'read'],
    ['WITH active AS (SELECT 1) SELECT * FROM active', 'read'],
  ])('classifica leitura: %s', (sql, expected) => {
    expect(classifyCommand(sql)).toBe(expected);
  });

  it.each(['insert into users values (1)', 'update users set active = 1', 'delete from users'])(
    'classifica escrita: %s',
    (sql) => {
      expect(classifyCommand(sql)).toBe('write');
    },
  );

  it.each(['merge users as target using source on 1 = 1', 'truncate table users'])(
    'classifica escrita avançada: %s',
    (sql) => {
      expect(classifyCommand(sql)).toBe('write');
    },
  );

  it.each([
    'create table users (id int)',
    'alter table users add name varchar(100)',
    'drop table users',
    'exec refresh_users',
  ])('classifica DDL: %s', (sql) => {
    expect(classifyCommand(sql)).toBe('ddl');
  });

  it('ignora comentários e diferencia maiúsculas de minúsculas', () => {
    expect(classifyCommand('-- comentário\n SeLeCt 1')).toBe('read');
  });

  it.each(['', '   ', '-- apenas comentário'])('rejeita SQL vazio: %j', (sql) => {
    expect(() => classifyCommand(sql)).toThrowError(InvalidSqlError);
  });

  it('rejeita SQL sem palavra-chave inicial', () => {
    expect(() => classifyCommand('!select 1')).toThrowError(InvalidSqlError);
  });

  it('rejeita comandos desconhecidos', () => {
    expect(() => classifyCommand('grant select on users to analyst')).toThrowError(InvalidSqlError);
  });

  it('rejeita uma condicional sem fechamento', () => {
    expect(() => classifyCommand('if exists (select 1')).toThrowError(InvalidSqlError);
  });

  it('não interpreta select dentro de um bloco if exists como leitura', () => {
    expect(classifyCommand('if exists (select 1 from users) update users set active = 0')).toBe(
      'write',
    );
  });
});
