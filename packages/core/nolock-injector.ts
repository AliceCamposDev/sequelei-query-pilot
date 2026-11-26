import { classifyCommand } from './command-classifier';
import { tokenize, type Token } from './highlighter';

export interface TableReference {
  alias?: string;
  end: number;
  existingHint?: string;
  hasNolock: boolean;
  insertAt: number;
  isCte: boolean;
  start: number;
  tableName: string;
}

export interface InjectNolockOptions {
  verbose?: boolean;
  views?: ReadonlySet<string> | readonly string[];
}

export interface InjectNolockResult {
  sql: string;
  warnings: string[];
}

const CLAUSE_STOP_KEYWORDS = new Set([
  'and',
  'apply',
  'cross',
  'else',
  'end',
  'except',
  'fetch',
  'for',
  'from',
  'full',
  'group',
  'having',
  'inner',
  'intersect',
  'into',
  'join',
  'left',
  'offset',
  'on',
  'option',
  'or',
  'order',
  'outer',
  'right',
  'select',
  'set',
  'then',
  'union',
  'using',
  'values',
  'when',
  'where',
  'with',
]);

/** Encontra referências de tabelas em cláusulas FROM e JOIN a partir dos tokens SQL. */
export function findTableReferences(tokens: readonly Token[]): TableReference[] {
  const codeTokens = tokens.filter((token) => token.kind !== 'comment');
  const cteNames = collectCteNames(codeTokens);
  const references: TableReference[] = [];

  for (let index = 0; index < codeTokens.length; index += 1) {
    const token = codeTokens[index];
    if (!token || token.kind !== 'keyword') continue;

    const lower = token.text.toLowerCase();
    if (lower !== 'from' && lower !== 'join') continue;

    const allowCommaList = lower === 'from';
    let cursor = index + 1;

    while (cursor < codeTokens.length) {
      const parsed = parseTableItem(codeTokens, cursor, cteNames);
      if (!parsed) break;

      if (parsed.reference) {
        references.push(parsed.reference);
      }

      cursor = parsed.nextIndex;

      if (allowCommaList && codeTokens[cursor]?.text === ',') {
        cursor += 1;
        continue;
      }

      break;
    }
  }

  return references;
}

/**
 * Injeta `with (nolock)` em tabelas referenciadas em consultas `select`.
 *
 * Limitações conhecidas: SQL dinâmico (ex.: strings executadas em `exec`) e
 * tabelas dentro de views não expandidas no banco não são reescritas internamente.
 */
export function injectNolock(sql: string): string;
export function injectNolock(
  sql: string,
  options: InjectNolockOptions & { verbose: true },
): InjectNolockResult;
export function injectNolock(
  sql: string,
  options?: InjectNolockOptions,
): string | InjectNolockResult;
export function injectNolock(
  sql: string,
  options: InjectNolockOptions = {},
): string | InjectNolockResult {
  const verbose = options.verbose === true;

  let commandKind: ReturnType<typeof classifyCommand>;
  try {
    commandKind = classifyCommand(sql);
  } catch {
    return verbose ? { sql, warnings: [] } : sql;
  }

  if (commandKind !== 'read') {
    return verbose ? { sql, warnings: [] } : sql;
  }

  const knownViews = normalizeViewSet(options.views);
  const tokens = tokenize(sql);
  const references = findTableReferences(tokens);
  const warnings: string[] = [];
  const insertions: number[] = [];

  for (const reference of references) {
    if (reference.isCte || reference.hasNolock) continue;

    if (reference.existingHint) {
      warnings.push(
        `Hint existente preservado na tabela ${reference.tableName}: ${reference.existingHint}`,
      );
      continue;
    }

    insertions.push(reference.insertAt);

    if (isKnownView(reference.tableName, knownViews)) {
      warnings.push(
        `View detectada (${reference.tableName}): aplicado with (nolock) na referência da view.`,
      );
    }
  }

  const orderedInsertions = [...insertions].sort((left, right) => right - left);
  let output = sql;

  for (const offset of orderedInsertions) {
    output = `${output.slice(0, offset)} with (nolock)${output.slice(offset)}`;
  }

  return verbose ? { sql: output, warnings } : output;
}

function collectCteNames(codeTokens: readonly Token[]): Set<string> {
  const cteNames = new Set<string>();

  for (let index = 0; index < codeTokens.length; index += 1) {
    const token = codeTokens[index];
    if (!token || token.kind !== 'keyword' || token.text.toLowerCase() !== 'with') continue;

    const prevText = codeTokens[index - 1]?.text;
    const isCteStart = index === 0 || prevText === ';' || prevText === '(';
    if (!isCteStart) continue;

    let cursor = index + 1;

    while (cursor < codeTokens.length) {
      const nameToken = codeTokens[cursor];
      if (!nameToken || (nameToken.kind !== 'identifier' && nameToken.kind !== 'function')) break;

      let probe = cursor + 1;

      if (codeTokens[probe]?.text === '(') {
        const closed = findMatchingParen(codeTokens, probe);
        if (closed === -1) break;
        probe = closed + 1;
      }

      if (codeTokens[probe]?.text.toLowerCase() !== 'as') break;
      if (codeTokens[probe + 1]?.text !== '(') break;

      const bodyEnd = findMatchingParen(codeTokens, probe + 1);
      if (bodyEnd === -1) break;

      cteNames.add(normalizeIdentifier(nameToken.text));
      cursor = bodyEnd + 1;

      if (codeTokens[cursor]?.text === ',') {
        cursor += 1;
        continue;
      }

      break;
    }
  }

  return cteNames;
}

function parseTableItem(
  codeTokens: readonly Token[],
  startIndex: number,
  cteNames: ReadonlySet<string>,
): { nextIndex: number; reference: TableReference | null } | null {
  const firstToken = codeTokens[startIndex];
  if (
    !firstToken ||
    firstToken.text === '(' ||
    (firstToken.kind !== 'identifier' && firstToken.kind !== 'function')
  ) {
    return null;
  }

  let cursor = startIndex;
  let tableName = firstToken.text;
  let endOffset = firstToken.end;

  while (
    codeTokens[cursor + 1]?.text === '.' &&
    codeTokens[cursor + 2] &&
    (codeTokens[cursor + 2]?.kind === 'identifier' || codeTokens[cursor + 2]?.kind === 'function')
  ) {
    const nextPart = codeTokens[cursor + 2]!;
    tableName += `.${nextPart.text}`;
    endOffset = nextPart.end;
    cursor += 2;
  }

  let next = cursor + 1;

  if (codeTokens[next]?.text === '(') {
    const legacyHint = parseLegacyNolockHint(codeTokens, next);
    if (legacyHint !== -1) {
      return {
        nextIndex: legacyHint + 1,
        reference: {
          end: endOffset,
          hasNolock: true,
          insertAt: endOffset,
          isCte: cteNames.has(normalizeIdentifier(tableName)),
          start: firstToken.start,
          tableName,
        },
      };
    }

    const closeParen = findMatchingParen(codeTokens, next);
    return {
      nextIndex: closeParen === -1 ? next + 1 : closeParen + 1,
      reference: null,
    };
  }

  let alias: string | undefined;
  const candidate = codeTokens[next];

  if (candidate?.kind === 'keyword' && candidate.text.toLowerCase() === 'as') {
    const aliasToken = codeTokens[next + 1];
    if (aliasToken && (aliasToken.kind === 'identifier' || aliasToken.kind === 'function')) {
      alias = aliasToken.text;
      endOffset = aliasToken.end;
      next += 2;
    }
  } else if (
    candidate &&
    (candidate.kind === 'identifier' ||
      (candidate.kind === 'function' && parseLegacyNolockHint(codeTokens, next + 1) !== -1)) &&
    !CLAUSE_STOP_KEYWORDS.has(candidate.text.toLowerCase())
  ) {
    alias = candidate.text;
    endOffset = candidate.end;
    next += 1;
  }

  let hasNolock = false;
  let existingHint: string | undefined;

  const hintCandidate = codeTokens[next];
  if (
    hintCandidate?.kind === 'keyword' &&
    hintCandidate.text.toLowerCase() === 'with' &&
    codeTokens[next + 1]?.text === '('
  ) {
    const closeParen = findMatchingParen(codeTokens, next + 1);
    if (closeParen !== -1) {
      const innerTokens = codeTokens.slice(next + 2, closeParen);
      hasNolock = innerTokens.some(
        (token) => token.kind === 'nolock' || token.text.toLowerCase() === 'readuncommitted',
      );
      if (!hasNolock) {
        existingHint = `with (${formatCompactTokens(innerTokens)})`;
      }
      next = closeParen + 1;
    }
  } else if (codeTokens[next]?.text === '(') {
    const legacyHintEnd = parseLegacyNolockHint(codeTokens, next);
    if (legacyHintEnd !== -1) {
      hasNolock = true;
      next = legacyHintEnd + 1;
    }
  }

  const reference: TableReference = {
    end: endOffset,
    hasNolock,
    insertAt: endOffset,
    isCte: cteNames.has(normalizeIdentifier(tableName)),
    start: firstToken.start,
    tableName,
  };

  if (alias !== undefined) {
    reference.alias = alias;
  }

  if (existingHint !== undefined) {
    reference.existingHint = existingHint;
  }

  return { nextIndex: next, reference };
}

function parseLegacyNolockHint(codeTokens: readonly Token[], openParenIndex: number): number {
  if (codeTokens[openParenIndex]?.text !== '(') return -1;

  const closeParen = findMatchingParen(codeTokens, openParenIndex);
  if (closeParen === -1) return -1;

  const inner = codeTokens.slice(openParenIndex + 1, closeParen);
  const isNolock =
    inner.length === 1 &&
    (inner[0]?.kind === 'nolock' || inner[0]?.text.toLowerCase() === 'readuncommitted');

  return isNolock ? closeParen : -1;
}

function findMatchingParen(codeTokens: readonly Token[], openParenIndex: number): number {
  let depth = 0;

  for (let index = openParenIndex; index < codeTokens.length; index += 1) {
    const text = codeTokens[index]?.text;
    if (text === '(') depth += 1;
    else if (text === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function formatCompactTokens(tokens: readonly Token[]): string {
  let result = '';

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]!;
    const prev = tokens[index - 1];

    if (
      prev &&
      current.text !== ')' &&
      current.text !== ',' &&
      current.text !== '(' &&
      prev.text !== '('
    ) {
      result += ' ';
    }

    result += current.text;
  }

  return result;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.replace(/[[\]]/g, '').toLowerCase();
}

function normalizeViewSet(views?: ReadonlySet<string> | readonly string[]): Set<string> {
  const normalized = new Set<string>();
  if (!views) return normalized;

  for (const view of views) {
    normalized.add(normalizeIdentifier(view));
  }

  return normalized;
}

function isKnownView(tableName: string, knownViews: ReadonlySet<string>): boolean {
  if (knownViews.size === 0) return false;

  const normalized = normalizeIdentifier(tableName);
  if (knownViews.has(normalized)) return true;

  const unqualified = normalized.split('.').pop();
  return unqualified !== undefined && knownViews.has(unqualified);
}
