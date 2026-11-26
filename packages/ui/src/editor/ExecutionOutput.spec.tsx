import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';

import {
  completeExecution,
  executionReducer,
  failExecution,
  startExecution,
} from '../store/executionSlice';
import { explorerReducer } from '../store/explorerSlice';
import { preferencesReducer } from '../store/preferencesSlice';
import { tabsReducer } from '../store/tabsSlice';

import { ExecutionOutput } from './ExecutionOutput';

function createStore() {
  return configureStore({
    reducer: {
      execution: executionReducer,
      explorer: explorerReducer,
      preferences: preferencesReducer,
      tabs: tabsReducer,
    },
  });
}

describe('ExecutionOutput', () => {
  afterEach(() => {
    cleanup();
  });

  it('exibe log de erro, selo NOLOCK e permite limpar mensagens', () => {
    const store = createStore();
    store.dispatch(
      startExecution({
        executableSql: 'select * from dbo.Clientes with (nolock)',
        executionId: 'exec-log-1',
        nolockApplied: true,
        warnings: ['Hint existente preservado'],
      }),
    );
    store.dispatch(
      failExecution({
        error: 'nenhuma conexão SQL Server configurada',
        executionId: 'exec-log-1',
      }),
    );

    render(
      <Provider store={store}>
        <ExecutionOutput />
      </Provider>,
    );

    expect(screen.getByTestId('nolock-badge').textContent).toBe('NOLOCK aplicado');
    expect(screen.getByText(/NOLOCK aplicado automaticamente/i)).not.toBeNull();
    expect(screen.getByText(/Hint existente preservado/i)).not.toBeNull();
    expect(screen.getByText(/nenhuma conexão SQL Server configurada/i)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar log' }));
    expect(screen.getByText(/pressione/i)).not.toBeNull();
  });

  it('renderiza grid de resultados com NULL em itálico e números alinhados após sucesso', () => {
    const store = createStore();
    store.dispatch(
      startExecution({
        executableSql: 'select 1 as Id, null as Obs',
        executionId: 'exec-ok-1',
        nolockApplied: false,
        warnings: [],
      }),
    );
    store.dispatch(
      completeExecution({
        columns: ['Id', 'Obs'],
        durationMs: 14,
        executionId: 'exec-ok-1',
        rows: [[{ type: 'Int', value: 42 }, { type: 'Null' }]],
        rowsAffected: 1,
      }),
    );

    render(
      <Provider store={store}>
        <ExecutionOutput />
      </Provider>,
    );

    expect(screen.getByTestId('result-grid')).not.toBeNull();
    expect(screen.getByText('42')).not.toBeNull();
    expect(screen.getByText('NULL').className).toContain('result-cell-null');
    expect(screen.getByText('14ms')).not.toBeNull();
  });
});
