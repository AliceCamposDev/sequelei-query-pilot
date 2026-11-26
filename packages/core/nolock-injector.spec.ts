import { describe, expect, it } from 'vitest';

import { tokenize } from './highlighter';
import { findTableReferences, injectNolock } from './nolock-injector';

describe('findTableReferences', () => {
  it('identifica tabela única após from', () => {
    const refs = findTableReferences(tokenize('select * from dbo.Clientes where Ativo = 1'));

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      hasNolock: false,
      isCte: false,
      tableName: 'dbo.Clientes',
    });
  });

  it('identifica tabela com alias e tabela com colchetes', () => {
    const refs = findTableReferences(
      tokenize(
        'select * from [dbo].[Clientes] as c inner join [dbo].[Pedidos] p on p.ClienteID = c.ClienteID',
      ),
    );

    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ alias: 'c', tableName: '[dbo].[Clientes]' });
    expect(refs[1]).toMatchObject({ alias: 'p', tableName: '[dbo].[Pedidos]' });
  });

  it('marca referências a CTEs e hints existentes', () => {
    const sql =
      'with vendas as (select * from dbo.Pedidos with (nolock)) select * from vendas join dbo.Itens with (index(IX_Itens)) on 1 = 1';
    const refs = findTableReferences(tokenize(sql));

    expect(refs).toHaveLength(3);
    expect(refs[0]).toMatchObject({ hasNolock: true, isCte: false, tableName: 'dbo.Pedidos' });
    expect(refs[1]).toMatchObject({ isCte: true, tableName: 'vendas' });
    expect(refs[2]).toMatchObject({
      existingHint: 'with (index(IX_Itens))',
      hasNolock: false,
      isCte: false,
      tableName: 'dbo.Itens',
    });
  });
});

describe('injectNolock', () => {
  it('adiciona with (nolock) em select de tabela única', () => {
    const input = 'select * from dbo.Clientes where Ativo = 1';
    const output = injectNolock(input);

    expect(output).toBe('select * from dbo.Clientes with (nolock) where Ativo = 1');
  });

  it('adiciona nolock em todas as tabelas de um join', () => {
    const input = `select c.Nome, p.ValorTotal
      from dbo.Clientes c
      inner join dbo.Pedidos p on p.ClienteID = c.ClienteID`;
    const output = injectNolock(input);

    expect(output).toContain('dbo.Clientes c with (nolock)');
    expect(output).toContain('dbo.Pedidos p with (nolock)');
  });

  it('adiciona nolock em múltiplos joins (left, right, full outer, cross) e alias com as', () => {
    const input = `select *
      from dbo.Clientes as c
      left outer join dbo.Pedidos as p on p.ClienteID = c.ClienteID
      right join dbo.Pagamentos pg on pg.PedidoID = p.PedidoID
      cross join dbo.Config cfg`;
    const output = injectNolock(input);

    expect(output).toContain('dbo.Clientes as c with (nolock)');
    expect(output).toContain('dbo.Pedidos as p with (nolock)');
    expect(output).toContain('dbo.Pagamentos pg with (nolock)');
    expect(output).toContain('dbo.Config cfg with (nolock)');
  });

  it('lida com nomes entre colchetes [dbo].[Tabela]', () => {
    const input = 'select * from [dbo].[TBResultados] r where r.Ativo = 1';
    const output = injectNolock(input);

    expect(output).toBe('select * from [dbo].[TBResultados] r with (nolock) where r.Ativo = 1');
  });

  it('não duplica hint quando with (nolock) já existe', () => {
    const input = 'select * from dbo.Clientes with (nolock)';

    expect(injectNolock(input)).toBe(input);
  });

  it('não duplica hint legado (nolock) sem with ou case diferente', () => {
    const withUpper = 'SELECT * FROM dbo.Clientes WITH (NOLOCK)';
    const legacy = 'select * from dbo.Clientes (nolock)';
    const legacyWithAlias = 'select * from dbo.Clientes c (nolock)';

    expect(injectNolock(withUpper)).toBe(withUpper);
    expect(injectNolock(legacy)).toBe(legacy);
    expect(injectNolock(legacyWithAlias)).toBe(legacyWithAlias);
  });

  it('é idempotente', () => {
    const input = 'select * from dbo.Clientes c join dbo.Pedidos p on p.ClienteID = c.ClienteID';
    const once = injectNolock(input);
    const twice = injectNolock(once);

    expect(twice).toBe(once);
  });

  it('não sobrescreve hint diferente e reporta aviso em modo verbose', () => {
    const input = 'select * from dbo.Clientes with (index(IX_Teste))';
    const { sql, warnings } = injectNolock(input, { verbose: true });

    expect(sql).toBe(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/hint existente/i);

    const multiHint = 'select * from dbo.Clientes with (updlock, rowlock)';
    const multiResult = injectNolock(multiHint, { verbose: true });
    expect(multiResult.sql).toBe(multiHint);
    expect(multiResult.warnings[0]).toContain('with (updlock, rowlock)');
  });

  it('não aplica em comandos de escrita ou DDL (update, delete, insert, merge, truncate, drop)', () => {
    const queries = [
      'update dbo.Clientes set Ativo = 0',
      'delete from dbo.Clientes where Ativo = 0',
      "insert into dbo.Clientes (Nome) values ('Alice')",
      'merge dbo.Clientes as t using dbo.Novos as s on t.Id = s.Id when matched then delete;',
      'truncate table dbo.Clientes',
      'drop table dbo.Clientes',
    ];

    for (const query of queries) {
      expect(injectNolock(query)).toBe(query);
      expect(injectNolock(query, { verbose: true })).toEqual({ sql: query, warnings: [] });
    }
  });

  it('lida com CTE simples e múltiplas CTEs sem aplicar nolock na própria CTE', () => {
    const input = `with cte as (select * from dbo.Clientes),
      cte2 (Id) as (select ClienteID from dbo.Pedidos)
      select * from cte join cte2 on cte.Id = cte2.Id`;
    const output = injectNolock(input);

    expect(output).toContain('dbo.Clientes with (nolock)');
    expect(output).toContain('dbo.Pedidos with (nolock)');
    expect(output).not.toContain('from cte with (nolock)');
    expect(output).not.toContain('join cte2 with (nolock)');
  });

  it('aplica nolock em subconsultas no from, where e select', () => {
    const input = `select (select count(*) from dbo.Logs) as TotalLogs
      from (select * from dbo.Clientes) as sub
      where sub.Id in (select ClienteID from dbo.Pedidos)`;
    const output = injectNolock(input);

    expect(output).toContain('dbo.Logs with (nolock)');
    expect(output).toContain('dbo.Clientes with (nolock)');
    expect(output).toContain('dbo.Pedidos with (nolock)');
    expect(output).not.toContain('as sub with (nolock)');
  });

  it('aplica nolock em todas as consultas de um union / union all', () => {
    const input = `select Id from dbo.ClientesAtivos
      union all
      select Id from dbo.ClientesInativos`;
    const output = injectNolock(input);

    expect(output).toContain('dbo.ClientesAtivos with (nolock)');
    expect(output).toContain('dbo.ClientesInativos with (nolock)');
  });

  it('lida com tabelas separadas por vírgula no from', () => {
    const input = 'select * from dbo.Clientes c, dbo.Pedidos p where c.Id = p.ClienteID';
    const output = injectNolock(input);

    expect(output).toContain('dbo.Clientes c with (nolock)');
    expect(output).toContain('dbo.Pedidos p with (nolock)');
  });

  it('não aplica nolock em table-valued functions ou variáveis de tabela', () => {
    const input = 'select * from dbo.fn_BuscarClientes(1) f';
    expect(injectNolock(input)).toBe(input);
  });

  it('aplica nolock em view conhecida e registra aviso informativo em verbose', () => {
    const input = 'select * from dbo.vw_FaturamentoMensal v where v.Ano = 2026';
    const result = injectNolock(input, { verbose: true, views: ['dbo.vw_FaturamentoMensal'] });

    expect(result.sql).toBe(
      'select * from dbo.vw_FaturamentoMensal v with (nolock) where v.Ano = 2026',
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/view/i);

    const unqualified = injectNolock(input, { verbose: true, views: ['vw_FaturamentoMensal'] });
    expect(unqualified.warnings).toHaveLength(1);
  });

  it('retorna SQL inalterado para entrada vazia ou malformada sem lançar exceção não tipada', () => {
    expect(injectNolock('')).toBe('');
    expect(injectNolock('-- apenas comentário')).toBe('-- apenas comentário');
    expect(injectNolock('???')).toBe('???');
    expect(injectNolock('select * from')).toBe('select * from');
    expect(injectNolock('select * from dbo.fn(1')).toBe('select * from dbo.fn(1');
    expect(injectNolock('with cte (a as (select 1) select * from cte')).toContain('with cte');
  });

  it('mantém regressão em SQL analítico real com joins, comentários e CTE', () => {
    const realSql = `-- Relatório de faturamento por cidade
with pedidos_recentes as (
    select p.ClienteID, sum(p.ValorTotal) as Total
    from dbo.Pedidos p
    where p.DataPedido >= '2026-01-01'
    group by p.ClienteID
)
select top 100
    c.Nome,
    c.Cidade,
    pr.Total
from dbo.Clientes as c
inner join pedidos_recentes as pr on pr.ClienteID = c.ClienteID
left join dbo.Cidades cid on cid.Nome = c.Cidade
where c.Ativo = 1
order by pr.Total desc;`;

    const output = injectNolock(realSql);

    expect(output).toContain('from dbo.Pedidos p with (nolock)');
    expect(output).toContain('from dbo.Clientes as c with (nolock)');
    expect(output).toContain('left join dbo.Cidades cid with (nolock)');
    expect(output).not.toContain('pedidos_recentes as pr with (nolock)');
    expect(injectNolock(output)).toBe(output);
  });
});
