import { describe, expect, it } from 'vitest';

import { FORMAT_RULES, formatSQL } from './formatter';

describe('formatSQL', () => {
  it('expõe regras puras de transformação de tokens', () => {
    expect(FORMAT_RULES.length).toBeGreaterThanOrEqual(3);
  });

  it('converte palavras-chave para minúsculas', () => {
    const input = 'SELECT Nome FROM dbo.Clientes WHERE Ativo = 1';
    const output = formatSQL(input);

    expect(output).toMatch(/^select Nome\s+from dbo\.Clientes\s+where Ativo = 1/);
  });

  it('preserva capitalização de identificadores', () => {
    const input = 'SELECT NomeCompleto FROM dbo.MeuCadastro';
    const output = formatSQL(input);

    expect(output).toContain('NomeCompleto');
    expect(output).toContain('dbo.MeuCadastro');
  });

  it('converte funções nativas para minúsculas preservando UDFs', () => {
    const input = 'SELECT COUNT(*), SUM(Valor), GETDATE(), dbo.CalcularBonus(Id) FROM Pedidos';
    const output = formatSQL(input);

    expect(output).toContain('count(*)');
    expect(output).toContain('sum(Valor)');
    expect(output).toContain('getdate()');
    expect(output).toContain('dbo.CalcularBonus(Id)');
  });

  it('converte tipos de dados para minúsculas', () => {
    const input =
      'CREATE TABLE dbo.Clientes (Id INT, Nome VARCHAR(100), Saldo DECIMAL(10, 2), Ativo BIT)';
    const output = formatSQL(input);

    expect(output).toContain('int');
    expect(output).toContain('varchar(100)');
    expect(output).toContain('decimal(10, 2)');
    expect(output).toContain('bit');
    expect(output).toContain('dbo.Clientes');
  });

  it('preserva comentários de linha e de bloco', () => {
    const lineComment = '-- comentário\nSELECT 1';
    const blockComment = '/* cabeçalho */ SELECT Nome FROM dbo.Clientes';

    expect(formatSQL(lineComment)).toBe('-- comentário\nselect 1');
    expect(formatSQL(blockComment)).toContain('/* cabeçalho */');
    expect(formatSQL(blockComment)).toContain('select Nome');
  });

  it('quebra linhas e aplica indentação de 4 espaços em select com múltiplas colunas e cláusulas', () => {
    const input =
      "SELECT TOP 100 c.Nome, c.Cidade, COUNT(p.PedidoID) AS TotalPedidos FROM dbo.Clientes AS c WITH (NOLOCK) INNER JOIN dbo.Pedidos AS p WITH (NOLOCK) ON p.ClienteID = c.ClienteID WHERE p.DataPedido >= '2024-01-01' GROUP BY c.Nome, c.Cidade ORDER BY TotalPedidos DESC;";

    const expected = [
      'select top 100',
      '    c.Nome,',
      '    c.Cidade,',
      '    count(p.PedidoID) as TotalPedidos',
      'from dbo.Clientes as c with (nolock)',
      'inner join dbo.Pedidos as p with (nolock)',
      '    on p.ClienteID = c.ClienteID',
      "where p.DataPedido >= '2024-01-01'",
      'group by c.Nome, c.Cidade',
      'order by TotalPedidos desc;',
    ].join('\n');

    expect(formatSQL(input)).toBe(expected);
  });

  it('quebra linhas em having, union e subconsultas preservando colchetes', () => {
    const input =
      'SELECT [Id], COUNT(*) AS Total FROM [dbo].[Pedidos] GROUP BY [Id] HAVING COUNT(*) > 1 UNION ALL SELECT [Id], 0 FROM [dbo].[Arquivo]';
    const output = formatSQL(input);

    expect(output).toContain('from [dbo].[Pedidos]');
    expect(output).toContain('\ngroup by [Id]');
    expect(output).toContain('\nhaving count(*) > 1');
    expect(output).toContain('\nunion all\nselect');
  });

  it('formata distinct, distinct top, cross apply e comentário inline', () => {
    const distinctSql = 'SELECT DISTINCT a, b FROM dbo.T CROSS APPLY (SELECT 1) x -- fim';
    const distinctOut = formatSQL(distinctSql);
    expect(distinctOut).toContain('select distinct\n    a,\n    b\nfrom dbo.T\ncross apply');
    expect(distinctOut).toContain('-- fim');

    const distinctTop = 'SELECT DISTINCT TOP 5 a, b FROM dbo.T';
    expect(formatSQL(distinctTop)).toBe('select distinct top 5\n    a,\n    b\nfrom dbo.T');
  });

  it('não aplica NOLOCK por conta própria', () => {
    const input = 'SELECT * FROM dbo.Clientes WHERE Ativo = 1';
    const output = formatSQL(input);

    expect(output).not.toMatch(/nolock/i);
  });

  it('é idempotente em diferentes formatos de consulta', () => {
    const samples = [
      'SELECT a, b FROM t WHERE x = 1',
      'SELECT TOP 10 c.Nome, SUM(p.Valor) AS Total FROM dbo.Clientes c LEFT OUTER JOIN dbo.Pedidos p ON p.ClienteID = c.Id WHERE c.Ativo = 1 GROUP BY c.Nome ORDER BY Total DESC;',
      '-- comentario\nSELECT 1',
      'WITH cte AS (SELECT Id FROM dbo.Clientes) SELECT Id FROM cte;',
      'UPDATE dbo.Clientes SET Ativo = 0 WHERE Id = 1;',
      '',
    ];

    for (const sample of samples) {
      const once = formatSQL(sample);
      const twice = formatSQL(once);
      expect(twice).toBe(once);
    }
  });
});
