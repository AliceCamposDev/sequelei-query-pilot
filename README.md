# Sequelei QueryPilot

> Ambiente de trabalho para analistas e engenheiros de dados escreverem, entenderem e executarem consultas SQL com assistência de IA.

O Sequelei QueryPilot reúne editor SQL, explorador de objetos, execução de consultas e um agente capaz de transformar perguntas em linguagem natural em SQL revisável. O foco inicial é SQL Server 2016+.

## Status

O projeto está na **Fase 0 - Fundação**. O monorepo, a validação TypeScript, o lint, a formatação, o Vitest e os workflows básicos do GitHub Actions já estão configurados. As funcionalidades de produto serão implementadas nas próximas fases do roadmap.

## Visão do produto

- Escrever e formatar SQL em um editor profissional.
- Explorar bancos, tabelas, views, procedimentos e colunas.
- Perguntar em português e receber SQL para revisar.
- Aplicar `with (nolock)` automaticamente em consultas de leitura, quando configurado.
- Classificar comandos e exigir confirmação para operações de escrita ou DDL.
- Salvar consultas e histórico localmente.
- Exportar resultados e consultar planos de execução.

## Arquitetura planejada

| Camada            | Tecnologia                           |
| ----------------- | ------------------------------------ |
| Aplicação desktop | Tauri 2                              |
| Interface         | React, TypeScript e Vite             |
| Estado            | Redux Toolkit                        |
| Editor SQL        | Monaco Editor                        |
| Backend local     | Rust                                 |
| Driver SQL Server | `tiberius`                           |
| Persistência      | SQLite                               |
| Agente de IA      | Proxy próprio + LLM                  |
| Testes            | Vitest, Testing Library e Playwright |

### Estrutura do monorepo

```text
packages/
  core/       Domínio puro: SQL, regras e agente
  ui/         Componentes React
  db/         Adaptadores de banco e mocks
  desktop/    Shell da aplicação desktop
apps/
  agent-proxy/ Serviço de proxy para o agente de IA
e2e/          Testes end-to-end com Playwright
docs/         ADRs e documentação técnica
```

## Pré-requisitos

- Node.js 20 ou superior
- Corepack habilitado
- pnpm 9
- Rust e Cargo, quando o shell Tauri for iniciado
- SQL Server 2016 ou superior para os testes de integração

## Começando

Clone o repositório e instale as dependências:

```powershell
corepack pnpm install
```

Execute o teste de fumaça do núcleo:

```powershell
corepack pnpm test
```

Para iniciar o shell desktop (requer Rust, Cargo e as dependências nativas do
Tauri):

```powershell
corepack pnpm dev:desktop
```

## Comandos disponíveis

```powershell
corepack pnpm lint          # ESLint
corepack pnpm format        # Formata arquivos de código e configuração
corepack pnpm format:check  # Verifica a formatação
corepack pnpm run ci        # Executa typecheck, lint, Stylelint e format check
corepack pnpm typecheck     # Verifica os tipos TypeScript
corepack pnpm test:all      # Executa os testes de todos os workspaces
corepack pnpm test:coverage # Executa cobertura V8 do core
corepack pnpm build         # Valida o build TypeScript atual
corepack pnpm dev:desktop   # Inicia o shell Tauri com o frontend Vite
```

> Use `corepack pnpm run ci`: `ci` é um comando reservado pelo pnpm quando
> executado sem `run`.

A suíte E2E é executada no GitHub Actions quando um pull request recebe o label `e2e`.

## Qualidade e CI

Cada pull request executa automaticamente:

1. ESLint
2. TypeScript strict mode
3. Testes dos workspaces
4. Build TypeScript

O workflow E2E instala o Chromium e executa o Playwright sob demanda. Consulte os workflows em `.github/workflows/`.

## Roadmap

O planejamento detalhado está em [ai_slop/Roadmap.md](ai_slop/Roadmap.md). A documentação de requisitos e as decisões de desenvolvimento estão em [ai_slop/Documento de Requisitos e Guia de Desenvolvimento.md](ai_slop/Documento%20de%20Requisitos%20e%20Guia%20de%20Desenvolvimento.md).

As próximas entregas incluem:

- Inicialização do shell Tauri com React.
- Editor SQL com Monaco e abas.
- Conexão com SQL Server e explorador de objetos.
- Pipeline de formatação, classificação e injeção de `nolock`.
- Execução segura de consultas e visualização de resultados.
- Agente de IA com contexto do schema.

## Contribuindo

Antes de abrir um pull request, execute:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:all
```

O projeto segue TDD: mudanças de comportamento devem começar por um teste que descreva o caso esperado.
