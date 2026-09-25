# Design tokens

Os tokens visuais do QueryPilot ficam em
[`packages/ui/src/styles/tokens.css`](../packages/ui/src/styles/tokens.css).
O arquivo contém a paleta primitiva aprovada e os tokens semânticos para os
temas escuro e claro.

## Paleta primitiva

| Token               | Cor                                                                                                                   | Uso                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `--ink-black`       | <span style="display:inline-block;width:1em;height:1em;background:#0b0814;border:1px solid #acaad1"></span> `#0b0814` | Fundo principal    |
| `--midnight-violet` | <span style="display:inline-block;width:1em;height:1em;background:#171128"></span> `#171128`                          | Painéis            |
| `--soft-periwinkle` | <span style="display:inline-block;width:1em;height:1em;background:#a994f2"></span> `#a994f2`                          | Acento             |
| `--cotton-candy`    | <span style="display:inline-block;width:1em;height:1em;background:#fc97b6"></span> `#fc97b6`                          | Alertas e destaque |
| `--periwinkle`      | <span style="display:inline-block;width:1em;height:1em;background:#acaad1"></span> `#acaad1`                          | Texto secundário   |
| `--lilac-ash`       | <span style="display:inline-block;width:1em;height:1em;background:#9f93ae"></span> `#9f93ae`                          | Texto auxiliar     |
| `--lavender`        | <span style="display:inline-block;width:1em;height:1em;background:#e9e3f0;border:1px solid #acaad1"></span> `#e9e3f0` | Texto principal    |

## Temas

O tema escuro é o padrão. O sistema operacional pode selecionar o tema claro
via `prefers-color-scheme: light` quando nenhum override estiver definido. A
preferência explícita vence a detecção automática:

```html
<html data-theme="light"></html>
```

Use sempre tokens semânticos nos componentes:

```css
.panel {
  background: var(--bg-1);
  border: 1px solid var(--border);
  color: var(--text);
}
```

## Tipografia

- **Inter:** interface, painéis e mensagens.
- **JetBrains Mono:** SQL, código e dados monoespaçados.

As fontes são carregadas pelos pacotes `@fontsource/*`, sem CDN, para manter o
app utilizável offline.

## Acessibilidade

O teste `contrast.spec.ts` verifica automaticamente pares de texto e fundo com
contraste mínimo WCAG AA de 4.5:1. O teste de snapshot também impede alterações
silenciosas na estrutura dos tokens.
