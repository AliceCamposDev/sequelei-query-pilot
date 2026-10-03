# Estado global

O estado global da UI usa Redux Toolkit. Cada domínio deve expor um slice com
estado tipado, actions e reducer puros em `packages/ui/src/store`.

## Preferences

O slice `preferences` contém as preferências definidas no DRG:

```ts
{
  applyNolock: true,
  lowercaseKeywords: true,
  defaultTop: 1000,
  queryTimeoutMs: 30000,
  theme: 'dark',
}
```

O middleware `preferencesSync` observa as actions de preferência e chama o
comando Tauri `save_preference(key, value)`. O comando atual usa memória
protegida por `Mutex` como placeholder para a futura persistência SQLite em
`user_preference`.

Para ler um valor dentro de um componente, use o hook tipado:

```tsx
const theme = usePreference('theme');
```

O store global está em `store.ts`, e a aplicação é envolvida pelo Provider do
React Redux no entrypoint `packages/ui/src/main.tsx`.
