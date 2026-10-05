# @sequelei/core

Pacote de domínio puro do Sequelei QueryPilot. Ele não depende de UI, banco ou
Tauri e concentra as regras reutilizáveis de SQL.

## Uso

```ts
import { prepareSql, tokenize } from '@sequelei/core';

const tokens = tokenize('select count(id) from dbo.users');
const prepared = prepareSql('select 1');
```

`prepareSql` expõe o contrato do pipeline `{ executableSql, formattedSql,
warnings }`. Nesta etapa ele é um stub que preserva a query; formatter, NOLOCK e
classificação serão compostos nas próximas entregas da Fase 1.

## Testes

Na raiz do monorepo:

```powershell
corepack pnpm --filter @sequelei/core test
corepack pnpm --filter @sequelei/core test:coverage
```
