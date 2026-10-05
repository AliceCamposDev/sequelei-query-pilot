import { useState } from 'react';

import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';

export interface ObjectTreeProps {
  onAskAi: (prompt: string) => void;
  onSelectTop1000: (schema: string, table: string) => void;
}

interface SelectedTable {
  schema: string;
  table: string;
}

export function ObjectTree({ onAskAi, onSelectTop1000 }: ObjectTreeProps) {
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    table: SelectedTable | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    table: null,
  });

  const handleContextMenu = (event: React.MouseEvent, schema: string, table: string) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      table: { schema, table },
    });
  };

  const closeMenu = () => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const getMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu.table) return [];
    const { schema, table } = contextMenu.table;
    const fullName = `${schema}.${table}`;
    const bracketedName = `[${schema}].[${table}]`;

    return [
      {
        action: () => onSelectTop1000(schema, table),
        id: 'select-top-1000',
        label: 'select top 1000 *',
      },
      {
        action: () => {
          // Placeholder para RF-EX-03: Gerar script CREATE TABLE
        },
        id: 'create-script',
        label: 'Gerar script CREATE TABLE',
      },
      {
        action: () => {
          // Placeholder para RF-EX-03: Gerar script INSERT
        },
        id: 'insert-script',
        label: 'Gerar script INSERT',
      },
      {
        action: () => {
          void navigator.clipboard?.writeText(bracketedName);
        },
        id: 'copy-name',
        label: 'Copiar nome completo',
      },
      {
        action: () => {
          onAskAi(`Descreva a tabela ${fullName} e sugira consultas úteis.`);
        },
        id: 'ask-ai',
        label: 'Perguntar à IA',
      },
    ];
  };

  return (
    <div className="panel-body explorer-tree" data-testid="explorer-tree">
      <button type="button" className="tree-row tree-row-active">
        ▾ <span>Banco de dados</span>
      </button>
      <button type="button" className="tree-row" style={{ paddingLeft: '1.2rem' }}>
        ▾ <span>dbo</span>
      </button>
      <button type="button" className="tree-row" style={{ paddingLeft: '2rem' }}>
        ▾ <span>Tabelas</span>
      </button>
      <button
        type="button"
        className="tree-row"
        style={{ paddingLeft: '2.8rem' }}
        onContextMenu={(event) => handleContextMenu(event, 'dbo', 'TBResultados')}
      >
        📄 <span>TBResultados</span>
      </button>
      <button
        type="button"
        className="tree-row"
        style={{ paddingLeft: '2.8rem' }}
        onContextMenu={(event) => handleContextMenu(event, 'dbo', 'TBClientes')}
      >
        📄 <span>TBClientes</span>
      </button>
      <button type="button" className="tree-row tree-row-muted" style={{ paddingLeft: '2rem' }}>
        ▸ <span>Views</span>
      </button>

      <ContextMenu
        isOpen={contextMenu.isOpen}
        items={getMenuItems()}
        onClose={closeMenu}
        position={contextMenu.position}
        title={contextMenu.table ? `Menu de ${contextMenu.table.table}` : undefined}
      />
    </div>
  );
}
