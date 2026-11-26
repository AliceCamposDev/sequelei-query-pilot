import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { clearExecutionMessages } from '../store/executionSlice';

import { ResultGrid } from './ResultGrid';

import type { AppDispatch, RootState } from '../store/store';

export function ExecutionOutput() {
  const dispatch = useDispatch<AppDispatch>();
  const execution = useSelector((state: RootState) => state.execution);
  const [activeTab, setActiveTab] = useState<'messages' | 'results'>('messages');

  useEffect(() => {
    if (execution.status === 'success' && execution.result && execution.result.columns.length > 0) {
      setActiveTab('results');
    } else if (
      execution.status === 'error' ||
      execution.status === 'cancelled' ||
      execution.status === 'running'
    ) {
      setActiveTab('messages');
    }
  }, [execution.result, execution.status]);

  const rowCount = execution.result?.rows.length ?? 0;

  return (
    <section
      className="execution-output"
      aria-label="Resultados e mensagens da execução"
      data-testid="execution-output"
    >
      <div className="execution-tabs" role="tablist" aria-label="Abas de saída">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'results'}
          className={activeTab === 'results' ? 'execution-tab-active' : ''}
          onClick={() => setActiveTab('results')}
        >
          Resultados {rowCount > 0 ? `(${rowCount})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'messages'}
          className={activeTab === 'messages' ? 'execution-tab-active' : ''}
          onClick={() => setActiveTab('messages')}
        >
          Mensagens {execution.messages.length > 0 ? `(${execution.messages.length})` : ''}
        </button>

        <div className="execution-tabs-meta">
          {execution.nolockApplied && (
            <span className="execution-badge" data-testid="nolock-badge">
              NOLOCK aplicado
            </span>
          )}
          {execution.durationMs !== null && (
            <span className="execution-duration">{execution.durationMs}ms</span>
          )}
          {execution.messages.length > 0 && (
            <button
              type="button"
              className="execution-clear-btn"
              onClick={() => dispatch(clearExecutionMessages())}
            >
              Limpar log
            </button>
          )}
        </div>
      </div>

      <div className="execution-body">
        {activeTab === 'messages' ? (
          execution.messages.length === 0 ? (
            <p className="execution-placeholder">
              Clique em <strong>Executar</strong> ou pressione <code>Ctrl+Enter</code> para rodar a
              consulta e acompanhar os logs aqui.
            </p>
          ) : (
            <ul className="execution-log-list" aria-label="Log de execução">
              {execution.messages.map((message) => (
                <li
                  key={message.id}
                  className={`execution-log-item execution-log-${message.level}`}
                >
                  <span className="execution-log-time">[{message.timestamp}]</span>
                  <span>{message.text}</span>
                </li>
              ))}
            </ul>
          )
        ) : execution.result && execution.result.columns.length > 0 ? (
          <ResultGrid
            key={execution.result.executionId}
            columns={execution.result.columns}
            rows={execution.result.rows}
          />
        ) : (
          <p className="execution-placeholder">
            {execution.error
              ? `Erro: ${execution.error}`
              : 'Nenhum conjunto de resultados disponível.'}
          </p>
        )}
      </div>
    </section>
  );
}
