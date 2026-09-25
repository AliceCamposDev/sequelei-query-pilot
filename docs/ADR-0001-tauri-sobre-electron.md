# ADR-0001: Escolha do Tauri sobre Electron

- **Status:** Aceita
- **Data:** 2026-09-24
- **Decisão:** usar Tauri 2 como shell desktop do Sequelei QueryPilot

## Contexto

O QueryPilot precisa ser uma aplicação desktop multiplataforma, com acesso a
drivers nativos, conexão com SQL Server e uma interface React. O shell também
deve permitir que operações sensíveis, como credenciais e execução de queries,
permaneçam fora do código executado diretamente no navegador.

As alternativas avaliadas foram Electron e Tauri.

## Decisão

Adotaremos Tauri 2, com frontend React/TypeScript e backend local em Rust.
O acesso ao SQL Server será implementado no backend Rust usando `tiberius`,
mantendo a chave de API do agente e as credenciais do banco fora do cliente.

## Justificativa

- Binários menores e menor consumo de memória, pois o Tauri utiliza o WebView
  nativo do sistema em vez de distribuir um runtime Chromium completo.
- Rust oferece bom controle sobre concorrência, memória e operações de I/O
  nativas.
- `tiberius` fornece suporte adequado ao SQL Server e ao dialeto T-SQL no
  ecossistema Rust.
- A fronteira de comandos do Tauri permite validar entradas no backend antes
  de acessar credenciais, banco ou sistema de arquivos.
- O frontend continua usando React e TypeScript, preservando o ecossistema
  escolhido para a interface.

## Consequências

### Positivas

- Aplicação mais leve que uma distribuição Electron equivalente.
- Melhor separação entre interface, acesso ao banco e operações privilegiadas.
- Reuso da mesma base de frontend em diferentes sistemas operacionais.

### Negativas

- A equipe precisa manter conhecimento de TypeScript e Rust.
- O build depende do toolchain Rust e de dependências nativas por sistema.
- Integrações Tauri exigem testes nos sistemas operacionais suportados.

## Alternativas rejeitadas

### Electron

Electron oferece integração madura com Node.js e uma experiência de
desenvolvimento uniforme, mas distribui um runtime Chromium completo e não
atende tão bem ao objetivo de manter o binário e o consumo de memória menores.
