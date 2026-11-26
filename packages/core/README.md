# @sequelei/core

Pacote de domínio puro do Sequelei QueryPilot. Ele não depende de UI, banco ou
Tauri e concentra as regras reutilizáveis de SQL.

## Uso

```ts
import {
  classifyCommand,
  formatSQL,
  injectNolock,
  prepareSql,
  tokenize,
} from '@sequelei/core';

const kind = classifyCommand('SELECT * FROM dbo.Clientes'); // 'read'
const tokens = tokenize('select count(id) from dbo.users');
const safeSql = injectNolock('select * from dbo.Clientes where Ativo = 1');
const prettySql = formatSQL('SELECT Nome FROM dbo.Clientes WHERE Ativo = 1');
const prepared = prepareSql('SELECT * FROM dbo.Clientes', { applyNolock: true });
```

`prepareSql` compõe `classifyCommand` + `injectNolock` + `formatSQL` e retorna
`{ commandKind, executableSql, formattedSql, nolockApplied, warnings }`.
Consulte [`docs/sql-pipeline.md`](../../docs/sql-pipeline.md) para detalhes do
fluxo, regras de formatação, códigos de erro (`SequeleiError`) e limitações.

## Testes

Na raiz do monorepo:

```powershell
corepack pnpm --filter @sequelei/core test
corepack pnpm --filter @sequelei/core test:coverage
```
