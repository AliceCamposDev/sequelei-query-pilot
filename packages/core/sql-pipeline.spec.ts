import { describe, expect, it } from 'vitest';

import { prepareSql, SequeleiError } from './index';

describe('prepareSql', () => {
  it('compõe classificação, injeção de nolock e formatação em select', () => {
    const raw =
      'SELECT c.Nome, COUNT(p.PedidoID) AS Total FROM dbo.Clientes c INNER JOIN dbo.Pedidos p ON p.ClienteID = c.Id WHERE c.Ativo = 1 GROUP BY c.Nome';

    const prepared = prepareSql(raw, { applyNolock: true });

    expect(prepared.commandKind).toBe('read');
    expect(prepared.nolockApplied).toBe(true);
    expect(prepared.warnings).toEqual([]);
    expect(prepared.executableSql).toContain('dbo.Clientes c with (nolock)');
    expect(prepared.executableSql).toContain('dbo.Pedidos p with (nolock)');
    expect(prepared.formattedSql).toBe(
      [
        'select',
        '    c.Nome,',
        '    count(p.PedidoID) as Total',
        'from dbo.Clientes c with (nolock)',
        'inner join dbo.Pedidos p with (nolock)',
        '    on p.ClienteID = c.Id',
        'where c.Ativo = 1',
        'group by c.Nome',
      ].join('\n'),
    );
  });

  it('respeita applyNolock: false sem injetar hint', () => {
    const raw = 'SELECT * FROM dbo.Clientes WHERE Ativo = 1';
    const prepared = prepareSql(raw, { applyNolock: false });

    expect(prepared.commandKind).toBe('read');
    expect(prepared.nolockApplied).toBe(false);
    expect(prepared.executableSql).toBe(raw);
    expect(prepared.formattedSql).toBe('select *\nfrom dbo.Clientes\nwhere Ativo = 1');
    expect(prepared.warnings).toEqual([]);
  });

  it('propaga avisos de hints existentes e views conhecidas', () => {
    const withHint = prepareSql('SELECT * FROM dbo.Clientes WITH (INDEX(IX_Nome))');
    expect(withHint.nolockApplied).toBe(false);
    expect(withHint.warnings[0]).toMatch(/hint existente/i);

    const withView = prepareSql('SELECT * FROM dbo.vw_Vendas', {
      applyNolock: true,
      views: ['dbo.vw_Vendas'],
    });
    expect(withView.nolockApplied).toBe(true);
    expect(withView.warnings[0]).toMatch(/view/i);
  });

  it('não injeta nolock em comandos de escrita ou DDL', () => {
    const update = prepareSql('UPDATE dbo.Clientes SET Ativo = 0 WHERE Id = 1');
    expect(update.commandKind).toBe('write');
    expect(update.nolockApplied).toBe(false);
    expect(update.executableSql).not.toMatch(/nolock/i);
    expect(update.formattedSql).toBe('update dbo.Clientes\nset Ativo = 0\nwhere Id = 1');

    const ddl = prepareSql('DROP TABLE dbo.TempClientes');
    expect(ddl.commandKind).toBe('ddl');
    expect(ddl.nolockApplied).toBe(false);
  });

  it('lança SequeleiError tipado para SQL vazio ou inválido', () => {
    expect(() => prepareSql('   -- apenas comentario')).toThrowError(SequeleiError);

    try {
      prepareSql('');
    } catch (error) {
      expect(error).toBeInstanceOf(SequeleiError);
      expect((error as SequeleiError).code).toBe('EMPTY_SQL');
    }
  });

  it('processa 500 consultas reais em menos de 1 segundo', () => {
    const templates = [
      'SELECT TOP 100 c.Nome, c.Cidade, COUNT(p.PedidoID) AS Total FROM dbo.Clientes c INNER JOIN dbo.Pedidos p ON p.ClienteID = c.Id WHERE c.Ativo = 1 GROUP BY c.Nome, c.Cidade ORDER BY Total DESC;',
      'WITH resumo AS (SELECT ClienteID, SUM(Valor) AS Total FROM dbo.Pedidos GROUP BY ClienteID) SELECT c.Nome, r.Total FROM dbo.Clientes c LEFT JOIN resumo r ON r.ClienteID = c.Id;',
      'SELECT Id, Nome FROM dbo.Produtos WHERE Preco > 50 UNION ALL SELECT Id, Nome FROM dbo.ProdutosArquivo WHERE Preco > 50;',
      "UPDATE dbo.Clientes SET Ativo = 0 WHERE UltimoPedido < '2023-01-01';",
      "SELECT * FROM [dbo].[TBResultados] WHERE Status = 'OK';",
    ];
    const queries = Array.from({ length: 500 }, (_, index) => templates[index % templates.length]!);

    const startedAt = performance.now();
    for (const sql of queries) {
      prepareSql(sql, { applyNolock: true });
    }
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1000);
  });
});
