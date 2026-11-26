import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ExecuteQueryResponse } from '../services/execution';

export type ExecutionStatus = 'cancelled' | 'error' | 'idle' | 'running' | 'success';

export type ExecutionMessageLevel = 'error' | 'info' | 'success' | 'warning';

export interface ExecutionMessage {
  id: string;
  level: ExecutionMessageLevel;
  text: string;
  timestamp: string;
}

export interface ExecutionState {
  activeExecutionId: string | null;
  durationMs: number | null;
  error: string | null;
  lastExecutableSql: string | null;
  messages: ExecutionMessage[];
  nolockApplied: boolean;
  result: ExecuteQueryResponse | null;
  status: ExecutionStatus;
  warnings: string[];
}

export const defaultExecutionState: ExecutionState = {
  activeExecutionId: null,
  durationMs: null,
  error: null,
  lastExecutableSql: null,
  messages: [],
  nolockApplied: false,
  result: null,
  status: 'idle',
  warnings: [],
};

let messageSeq = 1;

function makeMessage(level: ExecutionMessageLevel, text: string): ExecutionMessage {
  const now = new Date();
  const timestamp = now.toTimeString().slice(0, 8);
  const id = `msg-${messageSeq}`;
  messageSeq += 1;
  return { id, level, text, timestamp };
}

const executionSlice = createSlice({
  name: 'execution',
  initialState: defaultExecutionState,
  reducers: {
    startExecution(
      state,
      action: PayloadAction<{
        executableSql: string;
        executionId: string;
        nolockApplied: boolean;
        warnings: string[];
      }>,
    ) {
      state.status = 'running';
      state.activeExecutionId = action.payload.executionId;
      state.lastExecutableSql = action.payload.executableSql;
      state.nolockApplied = action.payload.nolockApplied;
      state.warnings = action.payload.warnings;
      state.error = null;
      state.durationMs = null;

      state.messages.push(
        makeMessage('info', `Executando consulta (${action.payload.executionId})...`),
      );
      if (action.payload.nolockApplied) {
        state.messages.push(
          makeMessage('info', 'NOLOCK aplicado automaticamente na cópia enviada.'),
        );
      }
      for (const warning of action.payload.warnings) {
        state.messages.push(makeMessage('warning', warning));
      }

      state.messages.push(makeMessage('info', `Executando consulta (${action.payload.executionId})...`));
      if (action.payload.nolockApplied) {
        state.messages.push(makeMessage('info', 'NOLOCK aplicado automaticamente na cópia enviada.'));
      }
      for (const warning of action.payload.warnings) {
        state.messages.push(makeMessage('warning', warning));
      }
    },
    completeExecution(state, action: PayloadAction<ExecuteQueryResponse>) {
      if (state.status !== 'running' || state.activeExecutionId !== action.payload.executionId) {
        return;
      }
      state.status = 'success';
      state.activeExecutionId = null;
      state.result = action.payload;
      state.durationMs = action.payload.durationMs;
      state.error = null;
      state.messages.push(
        makeMessage(
          'success',
          `Consulta concluída em ${action.payload.durationMs}ms (${action.payload.rows.length} linha(s), ${action.payload.rowsAffected} afetada(s)).`,
        ),
      );
    },
    failExecution(state, action: PayloadAction<{ error: string; executionId: string }>) {
      if (state.status !== 'running' || state.activeExecutionId !== action.payload.executionId) {
        return;
      }
      state.status = 'error';
      state.activeExecutionId = null;
      state.error = action.payload.error;
      state.messages.push(makeMessage('error', `Erro na execução: ${action.payload.error}`));
    },
    cancelExecution(state) {
      if (state.status !== 'running') return;
      state.status = 'cancelled';
      state.activeExecutionId = null;
      state.error = null;
      state.messages.push(makeMessage('warning', 'Execução cancelada pelo usuário.'));
    },
    clearExecutionMessages(state) {
      state.messages = [];
    },
    resetExecution() {
      return defaultExecutionState;
    },
  },
});

export const {
  cancelExecution,
  clearExecutionMessages,
  completeExecution,
  failExecution,
  resetExecution,
  startExecution,
} = executionSlice.actions;

export const executionReducer = executionSlice.reducer;
