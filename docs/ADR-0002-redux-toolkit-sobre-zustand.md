# ADR-0002: Escolha do Redux Toolkit sobre Zustand

- **Status:** Aceita
- **Data:** 2026-09-24
- **Decisão:** usar Redux Toolkit para o estado global da aplicação

## Contexto

O QueryPilot terá estado compartilhado entre editor, abas, explorador de
objetos, execução de queries, preferências, resultados e chat. Parte desse
estado será persistida localmente e outra parte será sincronizada com comandos
Tauri.

As alternativas avaliadas foram Redux Toolkit e Zustand.

## Decisão

Adotaremos Redux Toolkit para o store global e para os slices da aplicação.
Cada domínio deverá manter ações, reducers, seletores e efeitos bem definidos,
com testes unitários próximos da implementação.

## Justificativa

- Fluxo previsível de estado por meio de ações e reducers explícitos.
- DevTools maduras para inspeção de ações, estado e debugging de fluxos
  complexos.
- Convenções claras para colaboração em uma aplicação com muitos domínios.
- Integração oficial com React por meio de React-Redux.
- Middleware e RTK Query oferecem pontos de extensão para persistência,
  sincronização e operações assíncronas.
- Facilita testar transições de estado sem montar a interface inteira.

## Consequências

### Positivas

- Estado global rastreável e fácil de inspecionar.
- Menor risco de atualizações implícitas entre painéis independentes.
- Estrutura adequada para histórico, persistência e efeitos assíncronos.

### Negativas

- Mais arquivos e convenções do que uma solução mínima baseada em hooks.
- A equipe precisa entender actions, reducers, selectors e middleware.
- Slices pequenos e bem delimitados serão necessários para evitar um store
  monolítico.

## Alternativas rejeitadas

### Zustand

Zustand tem uma API menor e é uma boa escolha para estado local ou aplicações
com poucos domínios. Foi rejeitado para o estado global do QueryPilot porque
oferece menos convenções compartilhadas e menos ferramentas integradas para
auditar os fluxos complexos previstos.
