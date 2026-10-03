export type CommandKind = 'read' | 'write' | 'ddl';

export class InvalidSqlError extends Error {
  readonly code = 'INVALID_SQL';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidSqlError';
  }
}

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
    throw new InvalidSqlError('SQL vazio ou composto apenas por comentários');
  }

  const commandSql = commandAfterConditional(cleanedSql).toLowerCase();

  if (commandSql.startsWith('with ')) {
    return 'read';
  }

  const keyword = commandSql.match(/^[a-z]+/)?.[0];

  if (!keyword) {
    throw new InvalidSqlError('Não foi possível identificar o comando SQL');
  }

  if (['select'].includes(keyword)) return 'read';
  if (['insert', 'update', 'delete', 'merge', 'truncate'].includes(keyword)) return 'write';
  if (['create', 'alter', 'drop', 'exec'].includes(keyword)) return 'ddl';

  throw new InvalidSqlError(`Comando SQL não suportado: ${keyword}`);
}

function commandAfterConditional(sql: string): string {
  if (!/^if\s+exists\b/i.test(sql)) return sql;

  const conditionEnd = sql.indexOf(')');
  return conditionEnd === -1 ? sql : sql.slice(conditionEnd + 1).trimStart();
}
