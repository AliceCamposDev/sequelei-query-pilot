import { forwardRef } from 'react';

import type { ExplorerNode } from '../store/explorerSlice';

export interface TreeNodeProps {
  isExpanded: boolean;
  isFocusable: boolean;
  isLoading: boolean;
  isSelected: boolean;
  level: number;
  node: ExplorerNode;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

function getNodeIcon(kind: ExplorerNode['kind']): string {
  switch (kind) {
    case 'database':
      return '🗄️';
    case 'folder':
      return '📁';
    case 'table':
      return '📄';
    case 'view':
      return '👁️';
    case 'procedure':
      return '⚙️';
    case 'column':
      return '•';
  }
}

export const TreeNode = forwardRef<HTMLButtonElement, TreeNodeProps>(function TreeNode(
  {
    isExpanded,
    isFocusable,
    isLoading,
    isSelected,
    level,
    node,
    onClick,
    onContextMenu,
    onKeyDown,
  },
  ref,
) {
  const indentRem = 0.55 + (level - 1) * 0.85;
  const chevron = !node.hasChildren ? ' ' : isLoading ? '…' : isExpanded ? '▾' : '▸';
  const className = [
    'tree-row',
    isSelected ? 'tree-row-active' : '',
    node.kind === 'column' ? 'tree-row-muted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type="button"
      role="treeitem"
      aria-expanded={node.hasChildren ? isExpanded : undefined}
      aria-level={level}
      aria-selected={isSelected}
      tabIndex={isFocusable ? 0 : -1}
      className={className}
      style={{ paddingLeft: `${indentRem}rem` }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <span className="tree-chevron" aria-hidden="true">
        {chevron}
      </span>
      <span aria-hidden="true">{getNodeIcon(node.kind)}</span>
      <span className="tree-node-label">{node.label}</span>
      {node.isPrimaryKey && <span className="tree-node-pk">PK</span>}
      {node.dataType && <span className="tree-node-meta">{node.dataType}</span>}
    </button>
  );
});
