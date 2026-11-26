import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useSqlPipeline } from '../hooks/useSqlPipeline';
import {
  cancelQueryCommand,
  DEFAULT_QUERY_TIMEOUT_MS,
  executeQueryCommand,
  type ExecutionInvoker,
} from '../services/execution';
import {
  cancelExecution,
  completeExecution,
  failExecution,
  startExecution,
} from '../store/executionSlice';

import type { AppDispatch, RootState } from '../store/store';

let executionCounter = 1;

function nextExecutionId(): string {
  const id = `exec-ui-${Date.now()}-${executionCounter}`;
  executionCounter += 1;
  return id;
}

export interface RunButtonProps {
  connectionId?: string;
  invoker?: ExecutionInvoker;
  selectedSql?: string;
  sql: string;
}

export function RunButton({ connectionId, invoker, selectedSql, sql }: RunButtonProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { prepareSql } = useSqlPipeline();
  const execution = useSelector((state: RootState) => state.execution);
  const applyNolock = useSelector((state: RootState) => state.preferences.applyNolock);
  const queryTimeoutMs = useSelector(
    (state: RootState) => state.preferences.queryTimeoutMs || DEFAULT_QUERY_TIMEOUT_MS,
  );

  const isRunning = execution.status === 'running';

  const handleRun = useCallback(async () => {
    const rawSql = selectedSql && selectedSql.trim().length > 0 ? selectedSql : sql;
    const executionId = nextExecutionId();

    let prepared;
    try {
      prepared = prepareSql(rawSql, { applyNolock });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch(
        startExecution({
          executableSql: rawSql,
          executionId,
          nolockApplied: false,
          warnings: [],
        }),
      );
      dispatch(failExecution({ error: message, executionId }));
      return;
    }

    dispatch(
      startExecution({
        executableSql: prepared.executableSql,
        executionId,
        nolockApplied: prepared.nolockApplied,
        warnings: prepared.warnings,
      }),
    );

    try {
      const response = await executeQueryCommand(
        prepared.executableSql,
        {
          ...(connectionId ? { connectionId } : {}),
          executionId,
          timeoutMs: queryTimeoutMs,
        },
        invoker,
      );
      dispatch(
        completeExecution({
          ...response,
          executionId: response.executionId || executionId,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch(failExecution({ error: message, executionId }));
    }
  }, [applyNolock, connectionId, dispatch, invoker, prepareSql, queryTimeoutMs, selectedSql, sql]);

  const handleCancel = useCallback(() => {
    const targetId = execution.activeExecutionId;
    dispatch(cancelExecution());
    void cancelQueryCommand(targetId, invoker).catch(() => undefined);
  }, [dispatch, execution.activeExecutionId, invoker]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !isRunning) {
        event.preventDefault();
        void handleRun();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRun, isRunning]);

  if (isRunning) {
    return (
      <button
        type="button"
        className="run-button run-button-cancel"
        aria-label="Cancelar consulta"
        onClick={handleCancel}
      >
        Cancelar
      </button>
    );
  }

  return (
    <button
      type="button"
      className="run-button"
      aria-label={selectedSql?.trim() ? 'Executar seleção' : 'Executar consulta'}
      onClick={() => void handleRun()}
    >
      {selectedSql?.trim() ? 'Executar seleção' : 'Executar'}
    </button>
  );
}
