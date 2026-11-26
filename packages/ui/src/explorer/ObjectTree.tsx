import {
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ReactReduxContext } from 'react-redux';

import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { loadExplorerNodeChildren } from '../services/metadata';
import {
  collapseNode,
  defaultExplorerState,
  expandNode,
  explorerReducer,
  selectNode,
  setExplorerError,
  setFilter,
  setNodeChildren,
  setNodeLoading,
  type ExplorerNode,
  type ExplorerState,
} from '../store/explorerSlice';

import { TreeFilter } from './TreeFilter';
import { TreeNode } from './TreeNode';

import type { MetadataInvoker } from '../../../db/src/metadata';
import type { UnknownAction } from '@reduxjs/toolkit';

export interface ObjectTreeProps {
  connectionId?: string;
  initialExpandedIds?: string[];
  initialNodes?: ExplorerNode[];
  loadChildren?: (node: ExplorerNode) => Promise<ExplorerNode[]>;
  metadataInvoker?: MetadataInvoker;
  onAskAi: (prompt: string) => void;
  onSelectNode?: (node: ExplorerNode) => void;
  onSelectTop1000: (schema: string, table: string) => void;
}

interface SelectedTable {
  schema: string;
  table: string;
}

interface VisibleTreeItem {
  isExpanded: boolean;
  level: number;
  node: ExplorerNode;
  parentId: string | null;
}

function matchesFilter(node: ExplorerNode, normalizedQuery: string): boolean {
  const fullLabel = node.schema ? `${node.schema}.${node.label}` : node.label;
  return fullLabel.toLowerCase().includes(normalizedQuery);
}

function filterNodes(nodes: ExplorerNode[], normalizedQuery: string): ExplorerNode[] {
  if (!normalizedQuery) return nodes;

  const matched: ExplorerNode[] = [];
  for (const node of nodes) {
    const filteredChildren = node.children ? filterNodes(node.children, normalizedQuery) : [];
    if (matchesFilter(node, normalizedQuery) || filteredChildren.length > 0) {
      matched.push({
        ...node,
        children: filteredChildren.length > 0 ? filteredChildren : (node.children ?? []),
      });
    }
  }
  return matched;
}

function flattenVisibleTree(
  nodes: ExplorerNode[],
  expandedSet: ReadonlySet<string>,
  autoExpand: boolean,
  level = 1,
  parentId: string | null = null,
): VisibleTreeItem[] {
  const result: VisibleTreeItem[] = [];

  for (const node of nodes) {
    const hasLoadedChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded =
      node.hasChildren && (autoExpand ? hasLoadedChildren : expandedSet.has(node.id));
    result.push({ isExpanded, level, node, parentId });

    if (isExpanded && node.children && node.children.length > 0) {
      result.push(
        ...flattenVisibleTree(node.children, expandedSet, autoExpand, level + 1, node.id),
      );
    }
  }

  return result;
}

function useExplorerState(initialNodes?: ExplorerNode[], initialExpandedIds?: string[]) {
  const reduxContext = useContext(ReactReduxContext);
  const canUseRedux = Boolean(
    !initialNodes &&
    reduxContext &&
    'explorer' in (reduxContext.store.getState() as Record<string, unknown>),
  );

  const [localState, localDispatch] = useReducer(explorerReducer, {
    ...defaultExplorerState,
    expandedIds: initialExpandedIds ?? (initialNodes ? [] : defaultExplorerState.expandedIds),
    nodes: initialNodes ?? defaultExplorerState.nodes,
  });

  const reduxState = useSyncExternalStore(
    useCallback(
      (onStoreChange) => {
        if (!canUseRedux || !reduxContext) return () => undefined;
        return reduxContext.store.subscribe(onStoreChange);
      },
      [canUseRedux, reduxContext],
    ),
    useCallback(() => {
      if (!canUseRedux || !reduxContext) return localState;
      return (reduxContext.store.getState() as { explorer: ExplorerState }).explorer;
    }, [canUseRedux, localState, reduxContext]),
  );

  const dispatch = useCallback(
    (action: UnknownAction) => {
      if (canUseRedux && reduxContext) {
        reduxContext.store.dispatch(action);
      } else {
        localDispatch(action);
      }
    },
    [canUseRedux, reduxContext],
  );

  return { dispatch, state: canUseRedux ? reduxState : localState };
}

export function ObjectTree({
  connectionId,
  initialExpandedIds,
  initialNodes,
  loadChildren,
  metadataInvoker,
  onAskAi,
  onSelectNode,
  onSelectTop1000,
}: ObjectTreeProps) {
  const { dispatch, state } = useExplorerState(initialNodes, initialExpandedIds);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    table: SelectedTable | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    table: null,
  });

  const normalizedFilter = state.filter.trim().toLowerCase();
  const expandedSet = useMemo(() => new Set(state.expandedIds), [state.expandedIds]);
  const loadingSet = useMemo(() => new Set(state.loadingIds), [state.loadingIds]);

  const visibleItems = useMemo(() => {
    const filtered = filterNodes(state.nodes, normalizedFilter);
    return flattenVisibleTree(filtered, expandedSet, normalizedFilter.length > 0);
  }, [expandedSet, normalizedFilter, state.nodes]);

  const activeFocusableId =
    focusedId && visibleItems.some((item) => item.node.id === focusedId)
      ? focusedId
      : state.selectedId && visibleItems.some((item) => item.node.id === state.selectedId)
        ? state.selectedId
        : (visibleItems[0]?.node.id ?? null);

  const resolveLoader = useCallback(
    (node: ExplorerNode): Promise<ExplorerNode[]> | null => {
      if (loadChildren) {
        return loadChildren(node);
      }
      if (connectionId) {
        return loadExplorerNodeChildren(node, connectionId, metadataInvoker);
      }
      return null;
    },
    [connectionId, loadChildren, metadataInvoker],
  );

  const expandWithLazyLoad = useCallback(
    async (node: ExplorerNode) => {
      dispatch(expandNode(node.id));

      if (!node.hasChildren || node.loaded || loadingSet.has(node.id)) {
        return;
      }

      const loadPromise = resolveLoader(node);
      if (!loadPromise) {
        return;
      }

      dispatch(setNodeLoading({ id: node.id, loading: true }));
      try {
        const children = await loadPromise;
        dispatch(setNodeChildren({ children, id: node.id }));
      } catch (err) {
        dispatch(setNodeLoading({ id: node.id, loading: false }));
        dispatch(setExplorerError(err instanceof Error ? err.message : String(err)));
      }
    },
    [dispatch, loadingSet, resolveLoader],
  );

  const focusNodeById = (id: string) => {
    setFocusedId(id);
    nodeRefs.current[id]?.focus();
  };

  const handleNodeClick = (item: VisibleTreeItem) => {
    setFocusedId(item.node.id);
    dispatch(selectNode(item.node.id));
    onSelectNode?.(item.node);

    if (item.node.hasChildren) {
      if (item.isExpanded) {
        dispatch(collapseNode(item.node.id));
      } else {
        void expandWithLazyLoad(item.node);
      }
    }
  };

  const handleNodeKeyDown = (event: React.KeyboardEvent, index: number, item: VisibleTreeItem) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = visibleItems[index + 1];
      if (next) focusNodeById(next.node.id);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = visibleItems[index - 1];
      if (prev) focusNodeById(prev.node.id);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (item.node.hasChildren && !item.isExpanded) {
        void expandWithLazyLoad(item.node);
      } else if (item.isExpanded) {
        const firstChild = visibleItems[index + 1];
        if (firstChild && firstChild.parentId === item.node.id) {
          focusNodeById(firstChild.node.id);
        }
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (item.node.hasChildren && item.isExpanded) {
        dispatch(collapseNode(item.node.id));
      } else if (item.parentId) {
        focusNodeById(item.parentId);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNodeClick(item);
    }
  };

  const handleContextMenu = (event: React.MouseEvent, node: ExplorerNode) => {
    if (node.kind !== 'table') return;
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      table: { schema: node.schema ?? 'dbo', table: node.label },
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
      <TreeFilter value={state.filter} onChange={(value) => dispatch(setFilter(value))} />

      {state.error && (
        <div role="alert" className="tree-empty">
          {state.error}
        </div>
      )}

      <div role="tree" aria-label="Árvore de objetos do banco">
        {visibleItems.length === 0 ? (
          <p className="tree-empty">Nenhum objeto encontrado.</p>
        ) : (
          visibleItems.map((item, index) => (
            <TreeNode
              key={item.node.id}
              ref={(element) => {
                nodeRefs.current[item.node.id] = element;
              }}
              isExpanded={item.isExpanded}
              isFocusable={item.node.id === activeFocusableId}
              isLoading={loadingSet.has(item.node.id)}
              isSelected={state.selectedId === item.node.id}
              level={item.level}
              node={item.node}
              onClick={() => handleNodeClick(item)}
              onContextMenu={(event) => handleContextMenu(event, item.node)}
              onKeyDown={(event) => handleNodeKeyDown(event, index, item)}
            />
          ))
        )}
      </div>

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
