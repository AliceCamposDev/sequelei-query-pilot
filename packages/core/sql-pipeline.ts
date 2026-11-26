import { classifyCommand, type CommandKind } from './command-classifier';
import { formatSQL } from './formatter';
import { injectNolock } from './nolock-injector';

export interface PrepareSqlOptions {
  applyNolock?: boolean;
  views?: ReadonlySet<string> | readonly string[];
}

export interface PreparedSql {
  commandKind: CommandKind;
  executableSql: string;
  formattedSql: string;
  nolockApplied: boolean;
  warnings: string[];
}

/**
 * Executa o pipeline completo de preparação de SQL compondo:
 * 1. `classifyCommand` (valida e classifica em read/write/ddl)
 * 2. `injectNolock` (quando `read` e `applyNolock !== false`)
 * 3. `formatSQL` (normaliza keywords/funções/tipos e aplica indentação de 4 espaços)
 */
export function prepareSql(rawSql: string, options: PrepareSqlOptions = {}): PreparedSql {
  const commandKind = classifyCommand(rawSql);
  const applyNolock = options.applyNolock ?? true;

  if (commandKind !== 'read' || !applyNolock) {
    return {
      commandKind,
      executableSql: rawSql,
      formattedSql: formatSQL(rawSql),
      nolockApplied: false,
      warnings: [],
    };
  }

  const nolockOptions =
    options.views !== undefined
      ? { verbose: true as const, views: options.views }
      : { verbose: true as const };
  const injected = injectNolock(rawSql, nolockOptions);
  const nolockApplied = injected.sql !== rawSql;

  return {
    commandKind,
    executableSql: injected.sql,
    formattedSql: formatSQL(injected.sql),
    nolockApplied,
    warnings: injected.warnings,
  };
}
