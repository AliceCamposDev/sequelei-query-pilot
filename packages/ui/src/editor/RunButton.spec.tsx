import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { executionReducer } from '../store/executionSlice';
import { explorerReducer } from '../store/explorerSlice';
import { preferencesReducer } from '../store/preferencesSlice';
import { tabsReducer } from '../store/tabsSlice';

import { RunButton } from './RunButton';

import type { ExecuteQueryResponse, ExecutionInvoker } from '../services/execution';

function createTestStore() {
  return configureStore({
    reducer: {
      execution: executionReducer,
      explorer: explorerReducer,
      preferences: preferencesReducer,
      tabs: tabsReducer,
    },
  });
}

describe('RunButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('chama prepareSql (com nolock) e envia execute_query ao Tauri ao clicar em Executar', async () => {
    const store = createTestStore();
    const invoker = vi.fn(async (_command: string, payload?: unknown) => {
      const { options } = payload as { options: { executionId: string } };
      const response: ExecuteQueryResponse = {
        columns: ['Nome'],
        durationMs: 18,
        executionId: options.executionId,
        rows: [[{ type: 'Text', value: 'Alice' }]],
        rowsAffected: 1,
      };
      return response;
    }) as unknown as ExecutionInvoker;

    render(
      <Provider store={store}>
        <RunButton
          connectionId="conn-dev"
          invoker={invoker}
          sql="SELECT Nome FROM dbo.Clientes WHERE Ativo = 1"
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Executar consulta' }));

    await waitFor(() => {
      expect(store.getState().execution.status).toBe('success');
    });

    expect(invoker).toHaveBeenCalledWith('execute_query', {
      options: expect.objectContaining({
        connectionId: 'conn-dev',
        timeoutMs: 30_000,
      }),
      sql: 'SELECT Nome FROM dbo.Clientes with (nolock) WHERE Ativo = 1',
    });
    expect(store.getState().execution.nolockApplied).toBe(true);
    expect(store.getState().execution.durationMs).toBe(18);
  });

  it('envia apenas a seleção parcial quando há trecho selecionado no editor', async () => {
    const store = createTestStore();
    const invoker = vi.fn(async (_command: string, payload?: unknown) => {
      const { options } = payload as { options: { executionId: string } };
      return {
        columns: ['Id'],
        durationMs: 7,
        executionId: options.executionId,
        rows: [],
        rowsAffected: 0,
      };
    }) as unknown as ExecutionInvoker;

    render(
      <Provider store={store}>
        <RunButton
          invoker={invoker}
          selectedSql="select Id from dbo.Pedidos"
          sql="select * from dbo.Clientes;\nselect Id from dbo.Pedidos;"
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Executar seleção' }));

    await waitFor(() => {
      expect(store.getState().execution.status).toBe('success');
    });

    expect(invoker).toHaveBeenCalledWith('execute_query', {
      options: expect.objectContaining({ timeoutMs: 30_000 }),
      sql: 'select Id from dbo.Pedidos with (nolock)',
    });
  });

  it('botão Cancelar aborta a execução em curso enviando cancel_query ao Tauri', async () => {
    const store = createTestStore();
    let capturedExecutionId = '';

    const invoker = vi.fn((command: string, payload?: unknown) => {
      if (command === 'execute_query') {
        const { options } = payload as { options: { executionId: string } };
        capturedExecutionId = options.executionId;
        // Mantém pendente simulando query longa
        return new Promise<ExecuteQueryResponse>(() => undefined);
      }
      if (command === 'cancel_query') {
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    }) as unknown as ExecutionInvoker;

    render(
      <Provider store={store}>
        <RunButton invoker={invoker} sql="select * from dbo.TabelaGigante" />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Executar consulta' }));

    const cancelBtn = await screen.findByRole('button', { name: 'Cancelar consulta' });
    expect(store.getState().execution.status).toBe('running');

    fireEvent.click(cancelBtn);

    expect(store.getState().execution.status).toBe('cancelled');
    expect(invoker).toHaveBeenCalledWith('cancel_query', {
      executionId: capturedExecutionId,
    });
  });
});
