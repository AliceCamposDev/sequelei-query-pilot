import { FUNCS, tokenize, type Token } from './highlighter';

export type SqlFormatRule = (tokens: readonly Token[]) => Token[];

const INDENT = '    ';

const JOIN_MODIFIERS = new Set(['cross', 'full', 'inner', 'left', 'outer', 'right']);

const NEWLINE_CLAUSE_KEYWORDS = new Set([
  'except',
  'from',
  'group',
  'having',
  'intersect',
  'order',
  'set',
  'union',
  'values',
  'where',
]);

const SELECT_HEADER_MODIFIERS = new Set(['distinct', 'top']);

/** Normaliza keywords SQL e `nolock` para minúsculas. */
export function lowercaseKeywordsRule(tokens: readonly Token[]): Token[] {
  return tokens.map((token) =>
    token.kind === 'keyword' || token.kind === 'nolock'
      ? { ...token, text: token.text.toLowerCase() }
      : token,
  );
}

/** Normaliza funções nativas SQL para minúsculas, preservando UDFs. */
export function lowercaseNativeFunctionsRule(tokens: readonly Token[]): Token[] {
  return tokens.map((token) =>
    token.kind === 'function' && FUNCS.has(token.text.toLowerCase())
      ? { ...token, text: token.text.toLowerCase() }
      : token,
  );
}

/** Normaliza tipos de dados SQL para minúsculas. */
export function lowercaseDataTypesRule(tokens: readonly Token[]): Token[] {
  return tokens.map((token) =>
    token.kind === 'type' ? { ...token, text: token.text.toLowerCase() } : token,
  );
}

/** Lista ordenada de transformações puras aplicadas sobre os tokens antes do layout. */
export const FORMAT_RULES: readonly SqlFormatRule[] = [
  lowercaseKeywordsRule,
  lowercaseNativeFunctionsRule,
  lowercaseDataTypesRule,
];

/**
 * Formata uma consulta T-SQL aplicando normalização para minúsculas em keywords,
 * funções nativas e tipos, preservando identificadores e comentários com indentação
 * de 4 espaços. Não injeta `with (nolock)` (responsabilidade do `injectNolock`).
 */
export function formatSQL(sql: string): string {
  if (!sql.trim()) {
    return '';
  }

  let tokens: readonly Token[] = tokenize(sql);
  for (const rule of FORMAT_RULES) {
    tokens = rule(tokens);
  }

  return renderFormattedTokens(tokens);
}

function renderFormattedTokens(tokens: readonly Token[]): string {
  const lines: string[] = [];
  let currentLine = '';
  let parenDepth = 0;
  let inMultiColumnSelect = false;
  let expectingTopCount = false;
  let prevToken: Token | null = null;

  const pushCurrentLine = () => {
    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trimEnd());
    }
    currentLine = '';
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const lower = token.text.toLowerCase();

    if (token.kind === 'comment') {
      if (token.text.startsWith('--')) {
        if (currentLine.trim().length > 0) {
          currentLine += ` ${token.text}`;
        } else {
          currentLine = token.text;
        }
        pushCurrentLine();
      } else {
        if (currentLine.trim().length > 0) {
          currentLine += ` ${token.text}`;
        } else {
          currentLine = token.text;
        }
      }
      prevToken = token;
      continue;
    }

    if (token.text === '(') {
      const attach = shouldAttachOpenParen(prevToken);
      currentLine += attach || currentLine.trim().length === 0 ? '(' : ' (';
      parenDepth += 1;
      prevToken = token;
      continue;
    }

    if (token.text === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      currentLine += ')';
      prevToken = token;
      continue;
    }

    if (parenDepth === 0) {
      if (token.kind === 'keyword' && lower === 'select') {
        if (currentLine.trim().length > 0) {
          pushCurrentLine();
        }
        currentLine = 'select';
        inMultiColumnSelect = hasMultipleSelectColumns(tokens, index + 1);
        expectingTopCount = false;

        const nextToken = tokens[index + 1];
        if (
          inMultiColumnSelect &&
          nextToken &&
          !SELECT_HEADER_MODIFIERS.has(nextToken.text.toLowerCase())
        ) {
          pushCurrentLine();
          currentLine = INDENT;
        }

        prevToken = token;
        continue;
      }

      if (inMultiColumnSelect) {
        if (token.kind === 'keyword' && SELECT_HEADER_MODIFIERS.has(lower)) {
          currentLine += ` ${token.text}`;
          if (lower === 'top') {
            expectingTopCount = true;
          } else {
            const nextToken = tokens[index + 1];
            if (!nextToken || !SELECT_HEADER_MODIFIERS.has(nextToken.text.toLowerCase())) {
              pushCurrentLine();
              currentLine = INDENT;
            }
          }
          prevToken = token;
          continue;
        }

        if (expectingTopCount) {
          currentLine += ` ${token.text}`;
          expectingTopCount = false;
          pushCurrentLine();
          currentLine = INDENT;
          prevToken = token;
          continue;
        }

        if (token.text === ',') {
          currentLine += ',';
          pushCurrentLine();
          currentLine = INDENT;
          prevToken = token;
          continue;
        }
      }

      if (token.kind === 'keyword' && isClauseBreakStart(tokens, index)) {
        inMultiColumnSelect = false;
        expectingTopCount = false;
        if (currentLine.trim().length > 0) {
          pushCurrentLine();
        }
        currentLine = token.text;
        prevToken = token;
        continue;
      }

      if (token.kind === 'keyword' && lower === 'on') {
        inMultiColumnSelect = false;
        if (currentLine.trim().length > 0) {
          pushCurrentLine();
        }
        currentLine = `${INDENT}on`;
        prevToken = token;
        continue;
      }

      if (token.text === ';') {
        inMultiColumnSelect = false;
        currentLine += ';';
        pushCurrentLine();
        prevToken = token;
        continue;
      }
    }

    appendInlineToken(token, prevToken);
    prevToken = token;
  }

  pushCurrentLine();
  return lines.join('\n');

  function appendInlineToken(token: Token, previous: Token | null) {
    if (
      currentLine.length === 0 ||
      (currentLine.endsWith(INDENT) && currentLine.trim().length === 0)
    ) {
      currentLine += token.text;
      return;
    }

    if (
      token.text === ',' ||
      token.text === ';' ||
      token.text === '.' ||
      previous?.text === '(' ||
      previous?.text === '.'
    ) {
      currentLine += token.text;
      return;
    }

    currentLine += ` ${token.text}`;
  }
}

function shouldAttachOpenParen(previous: Token | null): boolean {
  if (!previous) return true;
  if (previous.text === '(') return true;
  return previous.kind === 'function' || previous.kind === 'type';
}

function isClauseBreakStart(tokens: readonly Token[], index: number): boolean {
  const token = tokens[index];
  if (!token || token.kind !== 'keyword') return false;

  const lower = token.text.toLowerCase();
  const prevLower = tokens[index - 1]?.text.toLowerCase();

  if (NEWLINE_CLAUSE_KEYWORDS.has(lower)) {
    return true;
  }

  if (JOIN_MODIFIERS.has(lower)) {
    if (prevLower && JOIN_MODIFIERS.has(prevLower)) {
      return false;
    }
    return lookaheadJoinOrApply(tokens, index);
  }

  if (lower === 'join') {
    return !prevLower || !JOIN_MODIFIERS.has(prevLower);
  }

  return false;
}

function lookaheadJoinOrApply(tokens: readonly Token[], startIndex: number): boolean {
  for (let offset = 1; offset <= 2; offset += 1) {
    const candidate = tokens[startIndex + offset];
    if (!candidate || candidate.kind !== 'keyword') return false;

    const lower = candidate.text.toLowerCase();
    if (lower === 'join' || lower === 'apply') return true;
    if (!JOIN_MODIFIERS.has(lower)) return false;
  }

  return false;
}

function hasMultipleSelectColumns(tokens: readonly Token[], startIndex: number): boolean {
  let depth = 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === 'comment') continue;

    if (token.text === '(') {
      depth += 1;
      continue;
    }
    if (token.text === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0) {
      if (token.text === ',') return true;
      if (token.text === ';') return false;
      if (token.kind === 'keyword' && NEWLINE_CLAUSE_KEYWORDS.has(token.text.toLowerCase())) {
        return false;
      }
    }
  }

  return false;
}
