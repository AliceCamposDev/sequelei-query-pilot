import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConnections } from './useConnections';

import type {
  ConnectionSummary,
  ConnectionTestResult,
  TauriCommandInvoker,
} from '../services/connections';

function ConnectionsHarness({ invoke }: { invoke?: TauriCommandInvoker }) {
  const { connections, create, error, loading, remove, test } = useConnections(invoke);

  return (
    <div>
      {loading && <span>Carregando conexões...</span>}
      {error && <span role="alert">{error}</span>}
      <ul aria-label="Lista de conexões">
        {connections.map((conn) => (
          <li key={conn.id}>
            <span>{conn.name}</span>
            <button type="button" onClick={() => void test(conn.id)}>
              Testar {conn.name}
            </button>
            <button type="button" onClick={() => void remove(conn.id)}>
              Remover {conn.name}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          void create({
            auth: { type: 'windows_sspi' },
            environment: 'dev',
            host: 'localhost',
            name: 'Nova Dev',
          }).catch(() => undefined)
        }
      >
        Criar conexão
      </button>
    </div>
  );
}

describe('useConnections (integração React ↔ Tauri)', () => {
  afterEach(() => {
    cleanup();
    delete window.__TAURI__;
  });

  it('chama list_connections via bridge Tauri ao montar e renderiza a lista recebida', async () => {
    const mockList: ConnectionSummary[] = [
      {
        authType: 'sql',
        createdAt: '2026-11-25 21:00:00',
        database: 'Vendas',
        encrypt: true,
        environment: 'production',
        host: 'sql.prod.empresa.com',
        id: 'conn-prod-1',
        name: 'Produção ERP',
        port: 1433,
        trustServerCertificate: false,
        username: 'analyst',
      },
    ];

    const invoke = vi.fn(async (command: string) => {
      if (command === 'list_connections') return mockList;
      return undefined;
    });

    window.__TAURI__ = { core: { invoke: invoke as unknown as TauriCommandInvoker } };

    render(<ConnectionsHarness />);

    await waitFor(() => {
      expect(screen.getByText('Produção ERP')).toBeTruthy();
    });
    expect(invoke).toHaveBeenCalledWith('list_connections', undefined);
  });

  it('executa create_connection, test_connection e delete_connection atualizando o estado React', async () => {
    const created: ConnectionSummary = {
      authType: 'windows_sspi',
      createdAt: '2026-11-25 21:10:00',
      database: null,
      encrypt: true,
      environment: 'dev',
      host: 'localhost',
      id: 'conn-dev-2',
      name: 'Nova Dev',
      port: 1433,
      trustServerCertificate: false,
      username: null,
    };
    const testResult: ConnectionTestResult = {
      latencyMs: 9,
      message: 'Conexão validada com sucesso',
      ok: true,
    };

    const invoker = vi.fn(async (command: string) => {
      if (command === 'list_connections') return [];
      if (command === 'create_connection') return created;
      if (command === 'test_connection') return testResult;
      if (command === 'delete_connection') return undefined;
      return undefined;
    }) as unknown as TauriCommandInvoker;

    render(<ConnectionsHarness invoke={invoker} />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando conexões...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Criar conexão'));

    await waitFor(() => {
      expect(screen.getByText('Nova Dev')).toBeTruthy();
    });
    expect(invoker).toHaveBeenCalledWith('create_connection', {
      payload: {
        auth: { type: 'windows_sspi' },
        environment: 'dev',
        host: 'localhost',
        name: 'Nova Dev',
      },
    });

    fireEvent.click(screen.getByText('Testar Nova Dev'));
    await waitFor(() => {
      expect(invoker).toHaveBeenCalledWith('test_connection', { id: 'conn-dev-2' });
    });

    fireEvent.click(screen.getByText('Remover Nova Dev'));
    await waitFor(() => {
      expect(screen.queryByText('Nova Dev')).toBeNull();
    });
    expect(invoker).toHaveBeenCalledWith('delete_connection', { id: 'conn-dev-2' });
  });

  it('exibe erro retornado pela validação do backend Rust sem quebrar a UI', async () => {
    const invoker = vi.fn(async (command: string) => {
      if (command === 'list_connections') return [];
      if (command === 'create_connection') {
        throw new Error('validation error: TLS is mandatory for remote host');
      }
      return undefined;
    }) as unknown as TauriCommandInvoker;

    render(<ConnectionsHarness invoke={invoker} />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando conexões...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Criar conexão'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('TLS is mandatory');
    });
  });
});
