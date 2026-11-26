import { describe, expect, it } from 'vitest';

import {
  cancelExecution,
  completeExecution,
  defaultExecutionState,
  executionReducer,
  failExecution,
  startExecution,
} from './executionSlice';

describe('executionSlice', () => {
  it('transiciona de idle para running e success', () => {
    let state = executionReducer(
      defaultExecutionState,
      startExecution({
        executableSql: 'select * from dbo.Clientes with (nolock)',
        executionId: 'exec-1',
        nolockApplied: true,
        warnings: [],
      }),
    );

    expect(state.status).toBe('running');
    expect(state.activeExecutionId).toBe('exec-1');
    expect(state.nolockApplied).toBe(true);

    state = executionReducer(
      state,
      completeExecution({
        columns: ['Id'],
        durationMs: 42,
        executionId: 'exec-1',
        rows: [[{ type: 'Int', value: 1 }]],
        rowsAffected: 1,
      }),
    );

    expect(state.status).toBe('success');
    expect(state.activeExecutionId).toBeNull();
    expect(state.durationMs).toBe(42);
    expect(state.result?.rows).toHaveLength(1);

    // Iniciar nova execução limpa resultado anterior para nunca mostrar dados antigos
    state = executionReducer(
      state,
      startExecution({
        executableSql: 'select 2',
        executionId: 'exec-1b',
        nolockApplied: false,
        warnings: [],
      }),
    );
    expect(state.result).toBeNull();
    expect(state.messages.at(-1)?.text).toContain('select 2');
  });

  it('cancela execução em andamento e ignora respostas tardias da execução cancelada', () => {
    let state = executionReducer(
      defaultExecutionState,
      startExecution({
        executableSql: 'select 1',
        executionId: 'exec-2',
        nolockApplied: false,
        warnings: [],
      }),
    );

    state = executionReducer(state, cancelExecution());
    expect(state.status).toBe('cancelled');
    expect(state.activeExecutionId).toBeNull();

    // Resposta tardia não sobrescreve estado cancelled
    state = executionReducer(
      state,
      completeExecution({
        columns: [],
        durationMs: 100,
        executionId: 'exec-2',
        rows: [],
        rowsAffected: 0,
      }),
    );
    expect(state.status).toBe('cancelled');
  });

  it('registra erro da execução ativa', () => {
    let state = executionReducer(
      defaultExecutionState,
      startExecution({
        executableSql: 'select * from TabelaInexistente',
        executionId: 'exec-3',
        nolockApplied: true,
        warnings: [],
      }),
    );

    state = executionReducer(
      state,
      failExecution({ error: 'Invalid object name', executionId: 'exec-3' }),
    );
    expect(state.status).toBe('error');
    expect(state.error).toBe('Invalid object name');
  });
});
