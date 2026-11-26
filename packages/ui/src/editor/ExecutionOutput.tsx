import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { clearExecutionMessages } from '../store/executionSlice';

import type { SqlValueDto } from '../services/execution';
import type { AppDispatch, RootState } from '../store/store';

function formatSqlCell(cell: SqlValueDto): { isNull: boolean; isNumeric: boolean; text: string } {
  if (cell.type === 'Null') {
    return { isNull: true, isNumeric: false, text: 'NULL' };
  }
  if (cell.type === 'Int' || cell.type === 'Float' || cell.type === 'Decimal') {
    return { isNull: false, isNumeric: true, text: String(cell.value ?? '') };
  }
  if (cell.type === 'Boolean') {
    return { isNull: false, isNumeric: false, text: cell.value ? 'true' : 'false' };
  }
  if (cell.type === 'Binary' && Array.isArray(cell.value)) {
    return { isNull: false, isNumeric: false, text: `0x${cell.value.length}B` };
  }
  return { isNull: false, isNumeric: false, text: String(cell.value ?? '') };
}

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
          <div className="execution-grid-wrapper">
            <table className="execution-grid" data-testid="result-grid">
              <thead>
                <tr>
                  <th className="execution-grid-index">#</th>
                  {execution.result.columns.map((column, index) => (
                    <th key={`${column}-${index}`}>{column || `(sem nome ${index + 1})`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {execution.result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td className="execution-grid-index">{rowIndex + 1}</td>
                    {row.map((cell, cellIndex) => {
                      const formatted = formatSqlCell(cell);
                      return (
                        <td
                          key={cellIndex}
                          className={[
                            formatted.isNull ? 'execution-cell-null' : '',
                            formatted.isNumeric ? 'execution-cell-num' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {formatted.text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
