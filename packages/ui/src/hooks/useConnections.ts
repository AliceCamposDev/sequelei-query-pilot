import { useCallback, useEffect, useState } from 'react';

import {
  createConnection,
  deleteConnection,
  listConnections,
  testConnection,
  type ConnectionSummary,
  type ConnectionTestResult,
  type CreateConnectionPayload,
  type TauriCommandInvoker,
} from '../services/connections';

export interface UseConnectionsResult {
  connections: ConnectionSummary[];
  create: (payload: CreateConnectionPayload) => Promise<ConnectionSummary>;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  test: (id: string) => Promise<ConnectionTestResult>;
}

export function useConnections(invoke?: TauriCommandInvoker): UseConnectionsResult {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listConnections(invoke);
      setConnections(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (payload: CreateConnectionPayload) => {
      setError(null);
      try {
        const created = await createConnection(payload, invoke);
        setConnections((prev) => [...prev, created]);
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [invoke],
  );

  const test = useCallback(
    async (id: string) => {
      setError(null);
      try {
        return await testConnection(id, invoke);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [invoke],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteConnection(id, invoke);
        setConnections((prev) => prev.filter((item) => item.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [invoke],
  );

  return { connections, create, error, loading, refresh, remove, test };
}
