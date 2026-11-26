export type TokenKind =
  | 'comment'
  | 'function'
  | 'identifier'
  | 'keyword'
  | 'nolock'
  | 'number'
  | 'operator'
  | 'string'
  | 'type';

export interface Token {
  end: number;
  kind: TokenKind;
  start: number;
  text: string;
}

export const KEYWORDS = new Set([
  'all',
  'alter',
  'and',
  'any',
  'apply',
  'as',
  'asc',
  'begin',
  'between',
  'by',
  'case',
  'create',
  'cross',
  'declare',
  'default',
  'delete',
  'desc',
  'distinct',
  'drop',
  'else',
  'end',
  'except',
  'exec',
  'exists',
  'fetch',
  'from',
  'full',
  'group',
  'having',
  'if',
  'in',
  'inner',
  'insert',
  'intersect',
  'into',
  'is',
  'join',
  'left',
  'like',
  'merge',
  'next',
  'not',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'outer',
  'over',
  'partition',
  'right',
  'rows',
  'select',
  'set',
  'table',
  'then',
  'top',
  'truncate',
  'union',
  'update',
  'using',
  'values',
  'view',
  'when',
  'where',
  'with',
]);

export const FUNCS = new Set([
  'avg',
  'cast',
  'coalesce',
  'concat',
  'convert',
  'count',
  'dateadd',
  'datediff',
  'datename',
  'datepart',
  'day',
  'dense_rank',
  'format',
  'getdate',
  'getutcdate',
  'isnull',
  'len',
  'lower',
  'ltrim',
  'max',
  'min',
  'month',
  'nullif',
  'rank',
  'replace',
  'round',
  'row_number',
  'rtrim',
  'substring',
  'sum',
  'trim',
  'upper',
  'year',
]);

export const TYPES = new Set([
  'bigint',
  'bit',
  'date',
  'datetime',
  'datetime2',
  'decimal',
  'float',
  'int',
  'money',
  'nvarchar',
  'real',
  'smallint',
  'text',
  'uniqueidentifier',
  'varchar',
]);

const TOKEN_PATTERN =
  /--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|-?\d+(?:\.\d+)?|<>|<=|>=|!=|[=<>+\-*/%]|[(),.;]|\[[^\]]+\]|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*/gy;

/** Tokeniza SQL sem interpretar palavras dentro de strings ou comentários. */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const pattern = new RegExp(TOKEN_PATTERN.source, TOKEN_PATTERN.flags);
  let cursor = 0;

  while (cursor < sql.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(sql);

    if (!match) {
      cursor += 1;
      continue;
    }

    const text = match[0];
    const start = match.index;
    const end = start + text.length;
    const kind = classifyToken(text, sql, end);

    tokens.push({ end, kind, start, text });
    cursor = end;
  }

  return tokens;
}

function classifyToken(text: string, sql: string, end: number): TokenKind {
  if (text.startsWith('--') || text.startsWith('/*')) return 'comment';
  if (text.startsWith("'")) return 'string';
  if (/^-?\d/.test(text)) return 'number';
  if (/^(<>|<=|>=|!=|[=<>+\-*/%])$/.test(text)) return 'operator';
  if (/^[()[\],.;]$/.test(text)) return 'operator';

  const normalized = text.toLowerCase();

  if (normalized === 'nolock') return 'nolock';
  if (TYPES.has(normalized)) return 'type';
  if (KEYWORDS.has(normalized)) return 'keyword';

  const nextNonWhitespace = sql.slice(end).match(/^\s*\(/);

  if (FUNCS.has(normalized) || nextNonWhitespace) return 'function';

  return 'identifier';
}
