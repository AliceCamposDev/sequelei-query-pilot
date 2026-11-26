export type ConnectionEnvironment = 'dev' | 'staging' | 'production';

export type CreateAuthPayload =
  { password: string; type: 'sql'; user: string } | { type: 'windows_sspi' };

export interface CreateConnectionPayload {
  auth: CreateAuthPayload;
  database?: string;
  encrypt?: boolean;
  environment?: ConnectionEnvironment;
  host: string;
  name: string;
  port?: number;
  trustServerCertificate?: boolean;
}

export interface ConnectionSummary {
  authType: 'sql' | 'windows_sspi';
  createdAt: string;
  database: string | null;
  encrypt: boolean;
  environment: ConnectionEnvironment;
  host: string;
  id: string;
  name: string;
  port: number;
  trustServerCertificate: boolean;
  username: string | null;
}

export interface ConnectionTestResult {
  latencyMs: number;
  message: string;
  ok: boolean;
}

export type TauriCommandInvoker = <T>(command: string, payload?: unknown) => Promise<T>;

const defaultInvoker: TauriCommandInvoker = async <T>(command: string, payload?: unknown) => {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    if (command === 'list_connections') {
      return [] as T;
    }
    throw new Error('Bridge Tauri indisponível neste ambiente.');
  }

  return invoke<T>(command, payload);
};

export function listConnections(
  invoke: TauriCommandInvoker = defaultInvoker,
): Promise<ConnectionSummary[]> {
  return invoke<ConnectionSummary[]>('list_connections');
}

export function createConnection(
  payload: CreateConnectionPayload,
  invoke: TauriCommandInvoker = defaultInvoker,
): Promise<ConnectionSummary> {
  return invoke<ConnectionSummary>('create_connection', { payload });
}

export function testConnection(
  id: string,
  invoke: TauriCommandInvoker = defaultInvoker,
): Promise<ConnectionTestResult> {
  return invoke<ConnectionTestResult>('test_connection', { id });
}

export function deleteConnection(
  id: string,
  invoke: TauriCommandInvoker = defaultInvoker,
): Promise<void> {
  return invoke<void>('delete_connection', { id });
}
