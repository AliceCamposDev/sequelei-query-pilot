export const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

export interface ExecuteQueryOptions {
  connectionId?: string;
  executionId?: string;
  timeoutMs?: number;
}

export interface SqlValueDto {
  type: 'Binary' | 'Boolean' | 'DateTime' | 'Decimal' | 'Float' | 'Int' | 'Null' | 'Text';
  value?: boolean | number | number[] | string;
}

export interface ExecuteQueryResponse {
  columns: string[];
  durationMs: number;
  executionId: string;
  rows: SqlValueDto[][];
  rowsAffected: number;
}

export type ExecutionInvoker = <T>(command: string, payload?: unknown) => Promise<T>;

const defaultExecutionInvoker: ExecutionInvoker = async <T>(command: string, payload?: unknown) => {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    throw new Error('Bridge Tauri indisponível para executar consultas SQL.');
  }

  return invoke<T>(command, payload);
};

export function executeQueryCommand(
  sql: string,
  options: ExecuteQueryOptions = {},
  invoke: ExecutionInvoker = defaultExecutionInvoker,
): Promise<ExecuteQueryResponse> {
  const resolvedOptions: ExecuteQueryOptions = {
    timeoutMs: DEFAULT_QUERY_TIMEOUT_MS,
    ...options,
  };

  return invoke<ExecuteQueryResponse>('execute_query', {
    options: resolvedOptions,
    sql,
  });
}

export function cancelQueryCommand(
  executionId?: string | null,
  invoke: ExecutionInvoker = defaultExecutionInvoker,
): Promise<boolean> {
  return invoke<boolean>('cancel_query', {
    executionId: executionId ?? null,
  });
}
