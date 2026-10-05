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
  'alter',
  'and',
  'as',
  'asc',
  'begin',
  'by',
  'case',
  'create',
  'delete',
  'desc',
  'distinct',
  'drop',
  'else',
  'end',
  'exec',
  'from',
  'group',
  'having',
  'if',
  'in',
  'insert',
  'into',
  'is',
  'join',
  'like',
  'merge',
  'not',
  'null',
  'on',
  'or',
  'order',
  'select',
  'set',
  'then',
  'union',
  'update',
  'values',
  'when',
  'where',
  'with',
]);

export const FUNCS = new Set([
  'coalesce',
  'count',
  'dateadd',
  'datediff',
  'getdate',
  'isnull',
  'max',
  'min',
  'sum',
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
