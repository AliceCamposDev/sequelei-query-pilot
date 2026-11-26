import { describe, expect, it } from 'vitest';

import { classifyCommand } from './command-classifier';
import { SequeleiError } from './errors';
import { formatSQL } from './formatter';
import { tokenize } from './highlighter';
import { injectNolock } from './nolock-injector';

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function generateValidSelect(rng: () => number): string {
  const schemas = ['dbo', 'vendas', '[dbo]'];
  const tables = ['Clientes', 'Pedidos', 'Itens', '[TBResultados]'];
  const cols = ['Id', 'Nome', 'ValorTotal', 'COUNT(*) AS Total', 'SUM(Valor) AS Soma'];
  const joins = ['INNER JOIN', 'LEFT JOIN', 'LEFT OUTER JOIN', 'RIGHT JOIN'];
  const t1 = `${pick(rng, schemas)}.${pick(rng, tables)}`;
  const t2 = `${pick(rng, schemas)}.${pick(rng, tables)}`;
  const c1 = pick(rng, cols);
  const c2 = pick(rng, cols);
  const selectClause = rng() > 0.5 ? `SELECT TOP 50 ${c1}, ${c2}` : `SELECT ${c1}`;
  const joinClause = rng() > 0.4 ? ` ${pick(rng, joins)} ${t2} t2 ON t2.Id = t1.Id` : '';
  const whereClause = rng() > 0.3 ? ' WHERE t1.Ativo = 1' : '';
  const orderClause = rng() > 0.5 ? ' ORDER BY t1.Id DESC' : '';

  return `${selectClause} FROM ${t1} t1${joinClause}${whereClause}${orderClause}`;
}

describe('propriedades e fuzzing do núcleo SQL', () => {
  it('propriedade: injectNolock é idempotente para 200 consultas geradas', () => {
    const rng = createRng(42);
    for (let index = 0; index < 200; index += 1) {
      const sql = generateValidSelect(rng);
      const once = injectNolock(sql);
      const twice = injectNolock(once);
      expect(twice).toBe(once);
    }
  });

  it('propriedade: formatSQL é idempotente para 200 consultas geradas', () => {
    const rng = createRng(1337);
    for (let index = 0; index < 200; index += 1) {
      const sql = generateValidSelect(rng);
      const once = formatSQL(sql);
      const twice = formatSQL(once);
      expect(twice).toBe(once);
    }
  });

  it('propriedade: classifyCommand retorna sempre read, write ou ddl em consultas válidas', () => {
    const rng = createRng(99);
    const writeTemplates = [
      'INSERT INTO dbo.T VALUES (1)',
      'UPDATE dbo.T SET A = 1 WHERE Id = 2',
      'DELETE FROM dbo.T WHERE Id = 1',
      'MERGE dbo.T AS t USING dbo.S AS s ON t.Id = s.Id WHEN MATCHED THEN DELETE;',
      'TRUNCATE TABLE dbo.T',
    ];
    const ddlTemplates = [
      'CREATE TABLE dbo.T (Id INT)',
      'ALTER TABLE dbo.T ADD Nome VARCHAR(50)',
      'DROP TABLE dbo.T',
      'EXEC dbo.sp_Atualizar',
    ];

    for (let index = 0; index < 150; index += 1) {
      const sql =
        index % 3 === 0
          ? generateValidSelect(rng)
          : index % 3 === 1
            ? pick(rng, writeTemplates)
            : pick(rng, ddlTemplates);

      const kind = classifyCommand(sql);
      expect(['read', 'write', 'ddl']).toContain(kind);
    }
  });

  it('propriedade: nenhum comando de escrita é classificado como read', () => {
    const rng = createRng(2026);
    const writeKeywords = ['insert', 'INSERT', 'Update', 'DELETE', 'mErGe', 'TRUNCATE'];
    const prefixes = ['', '   ', '-- aviso\n', '/* bloco */\n  ', 'if exists (select 1 from t) '];

    for (let index = 0; index < 200; index += 1) {
      const sql = `${pick(rng, prefixes)}${pick(rng, writeKeywords)} dbo.Tabela set x = 1`;
      const kind = classifyCommand(sql);
      expect(kind).toBe('write');
      expect(kind).not.toBe('read');
    }
  });

  it('fuzzing: entradas malformadas nunca lançam exceção não tipada', () => {
    const rng = createRng(777);
    const fragments = [
      'select',
      'from',
      'with',
      '(',
      ')',
      '[',
      ']',
      "'",
      "''",
      '--',
      '/*',
      '*/',
      ';',
      ',',
      '.',
      '=',
      '<>',
      '123',
      'dbo.T',
      'if exists (',
      'join',
      'nolock',
      '\n',
      '   ',
      '???',
      '@var',
    ];

    for (let index = 0; index < 200; index += 1) {
      const length = 1 + Math.floor(rng() * 14);
      const malformed = Array.from({ length }, () => pick(rng, fragments)).join(' ');

      expect(() => tokenize(malformed)).not.toThrow();
      expect(() => formatSQL(malformed)).not.toThrow();
      expect(() => injectNolock(malformed)).not.toThrow();

      try {
        const kind = classifyCommand(malformed);
        expect(['read', 'write', 'ddl']).toContain(kind);
      } catch (error) {
        expect(error).toBeInstanceOf(SequeleiError);
      }
    }
  });
});
