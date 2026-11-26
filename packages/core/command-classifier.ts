import { InvalidSqlError } from './errors';

export { InvalidSqlError } from './errors';

export type CommandKind = 'read' | 'write' | 'ddl';

/** Remove comentários e espaços antes do primeiro comando SQL. */
export function stripLeadingComments(sql: string): string {
  let remaining = sql.trimStart();

  while (remaining.startsWith('--') || remaining.startsWith('/*')) {
    if (remaining.startsWith('--')) {
      const lineEnd = remaining.indexOf('\n');
      remaining = lineEnd === -1 ? '' : remaining.slice(lineEnd + 1).trimStart();
      continue;
    }

    const commentEnd = remaining.indexOf('*/', 2);
    remaining = commentEnd === -1 ? '' : remaining.slice(commentEnd + 2).trimStart();
  }

  return remaining;
}

/** Classifica um comando SQL como leitura, escrita ou DDL. */
export function classifyCommand(sql: string): CommandKind {
  const cleanedSql = stripLeadingComments(sql);

  if (!cleanedSql) {
    throw new InvalidSqlError('SQL vazio ou composto apenas por comentários', 'EMPTY_SQL');
  }

  const withoutUse = stripLeadingUseStatements(cleanedSql);
  if (!withoutUse) {
    return 'read';
  }

  const commandSql = commandAfterConditional(withoutUse).toLowerCase();

  if (/^with\s+/.test(commandSql)) {
    return 'read';
  }

  const keyword = commandSql.match(/^[a-z]+/)?.[0];

  if (!keyword) {
    throw new InvalidSqlError('Não foi possível identificar o comando SQL', 'INVALID_SQL');
  }

  if (keyword === 'select') return 'read';
  if (['insert', 'update', 'delete', 'merge', 'truncate'].includes(keyword)) return 'write';
  if (['create', 'alter', 'drop', 'exec'].includes(keyword)) return 'ddl';

  throw new InvalidSqlError(`Comando SQL não suportado: ${keyword}`, 'UNSUPPORTED_COMMAND');
}

function stripLeadingUseStatements(sql: string): string {
  let remaining = sql;

  while (/^use\s+(?:\[[^\]]+\]|[A-Za-z_][\w$]*)\s*;?/i.test(remaining)) {
    remaining = stripLeadingComments(
      remaining.replace(/^use\s+(?:\[[^\]]+\]|[A-Za-z_][\w$]*)\s*;?/i, ''),
    );
  }

  return remaining;
}

function commandAfterConditional(sql: string): string {
  if (!/^if\s+exists\b/i.test(sql)) return sql;

  const conditionEnd = sql.indexOf(')');

  if (conditionEnd === -1) {
    throw new InvalidSqlError('Bloco condicional SQL sem fechamento', 'MALFORMED_SQL');
  }

  return sql.slice(conditionEnd + 1).trimStart();
}
