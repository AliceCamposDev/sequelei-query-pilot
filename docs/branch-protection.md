# Proteção da branch `main`

Esta configuração precisa ser aplicada nas configurações do repositório no
GitHub. Ela não é reproduzida por arquivos locais do projeto.

## Configuração recomendada

Em **Settings > Branches > Branch protection rules**, crie uma regra para
`main` com estas opções:

- Exigir pull request antes do merge.
- Exigir pelo menos uma aprovação.
- Exigir que conversas sejam resolvidas antes do merge.
- Exigir que a branch esteja atualizada antes do merge.
- Exigir status checks aprovados antes do merge.
- Selecionar o job `Quality checks` do workflow `CI` como check obrigatório.
- Bloquear pushes diretos na branch `main`.
- Aplicar a regra também a administradores, quando essa opção estiver
  disponível para o plano do repositório.

O workflow E2E não precisa ser um check obrigatório da regra geral, pois ele é
executado sob demanda quando o pull request recebe o label `e2e`.

## Critério de conclusão

Depois de salvar a regra, abra um pull request de teste e confirme que:

1. Um push direto para `main` é recusado.
2. O merge fica bloqueado enquanto o job `Quality checks` não passa.
3. O merge exige a aprovação configurada.

Após essa verificação, marque a task correspondente no
`ai_slop/Roadmap.md` como concluída.
