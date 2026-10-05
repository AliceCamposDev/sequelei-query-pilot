# Tokenizer SQL

O tokenizer do `@sequelei/core` está em
[`packages/core/highlighter.ts`](../packages/core/highlighter.ts). Ele transforma
uma query T-SQL em tokens posicionados, sem interpretar palavras dentro de
strings ou comentários.

## Contrato

```ts
interface Token {
  text: string;
  kind:
    | 'comment'
    | 'function'
    | 'identifier'
    | 'keyword'
    | 'nolock'
    | 'number'
    | 'operator'
    | 'string'
    | 'type';
  start: number;
  end: number;
}
```

`start` é inclusivo e `end` é exclusivo. Os conjuntos `KEYWORDS`, `FUNCS` e
`TYPES` são exportados para permitir que o editor e outras regras do domínio
reutilizem a mesma classificação.

## Exemplo

```ts
import { tokenize } from '@sequelei/core/highlighter';

const tokens = tokenize("select count(id) from dbo.users where name = 'Ada'");
```

Strings SQL com escape `''`, comentários `--`/`/* */`, números negativos,
operadores, funções nativas e funções definidas pelo usuário são reconhecidos
pela mesma expressão de tokenização. O teste de performance garante 1.000
linhas processadas em menos de 200ms no ambiente de referência.

## Limitação atual

A API atual processa a query completa em cada chamada. A futura otimização por
linha e cache do último estado será adicionada quando o editor começar a enviar
alterações incrementais.
