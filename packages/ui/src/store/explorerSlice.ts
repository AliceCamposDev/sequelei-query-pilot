import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ExplorerNodeKind = 'column' | 'database' | 'folder' | 'procedure' | 'table' | 'view';

export interface ExplorerNode {
  children?: ExplorerNode[];
  dataType?: string;
  database?: string;
  folderType?: 'procedures' | 'tables' | 'views';
  hasChildren: boolean;
  id: string;
  isPrimaryKey?: boolean;
  kind: ExplorerNodeKind;
  label: string;
  loaded: boolean;
  schema?: string;
}

export interface ExplorerState {
  error: string | null;
  expandedIds: string[];
  filter: string;
  loadingIds: string[];
  nodes: ExplorerNode[];
  selectedId: string | null;
}

export const DEFAULT_EXPLORER_NODES: ExplorerNode[] = [
  {
    children: [
      {
        children: [
          {
            database: 'Banco de dados',
            hasChildren: true,
            id: 'db:default:table:dbo.TBResultados',
            kind: 'table',
            label: 'TBResultados',
            loaded: false,
            schema: 'dbo',
          },
          {
            database: 'Banco de dados',
            hasChildren: true,
            id: 'db:default:table:dbo.TBClientes',
            kind: 'table',
            label: 'TBClientes',
            loaded: false,
            schema: 'dbo',
          },
        ],
        database: 'Banco de dados',
        folderType: 'tables',
        hasChildren: true,
        id: 'db:default:folder:tables',
        kind: 'folder',
        label: 'Tabelas',
        loaded: true,
      },
      {
        database: 'Banco de dados',
        folderType: 'views',
        hasChildren: true,
        id: 'db:default:folder:views',
        kind: 'folder',
        label: 'Views',
        loaded: false,
      },
      {
        database: 'Banco de dados',
        folderType: 'procedures',
        hasChildren: true,
        id: 'db:default:folder:procedures',
        kind: 'folder',
        label: 'Procedures',
        loaded: false,
      },
    ],
    database: 'Banco de dados',
    hasChildren: true,
    id: 'db:default',
    kind: 'database',
    label: 'Banco de dados',
    loaded: true,
  },
];

export const defaultExplorerState: ExplorerState = {
  error: null,
  expandedIds: ['db:default', 'db:default:folder:tables'],
  filter: '',
  loadingIds: [],
  nodes: DEFAULT_EXPLORER_NODES,
  selectedId: null,
};

function updateNodeChildrenRecursive(
  nodes: ExplorerNode[],
  targetId: string,
  children: ExplorerNode[],
): boolean {
  for (const node of nodes) {
    if (node.id === targetId) {
      node.children = children;
      node.loaded = true;
      node.hasChildren = children.length > 0;
      return true;
    }

    if (node.children && updateNodeChildrenRecursive(node.children, targetId, children)) {
      return true;
    }
  }

  return false;
}

const explorerSlice = createSlice({
  name: 'explorer',
  initialState: defaultExplorerState,
  reducers: {
    setNodes(state, action: PayloadAction<ExplorerNode[]>) {
      state.nodes = action.payload;
      state.error = null;
    },
    expandNode(state, action: PayloadAction<string>) {
      if (!state.expandedIds.includes(action.payload)) {
        state.expandedIds.push(action.payload);
      }
    },
    collapseNode(state, action: PayloadAction<string>) {
      state.expandedIds = state.expandedIds.filter((id) => id !== action.payload);
    },
    toggleNode(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.expandedIds.includes(id)) {
        state.expandedIds = state.expandedIds.filter((item) => item !== id);
      } else {
        state.expandedIds.push(id);
      }
    },
    selectNode(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    setFilter(state, action: PayloadAction<string>) {
      state.filter = action.payload;
    },
    setNodeLoading(state, action: PayloadAction<{ id: string; loading: boolean }>) {
      const { id, loading } = action.payload;
      if (loading) {
        if (!state.loadingIds.includes(id)) {
          state.loadingIds.push(id);
        }
      } else {
        state.loadingIds = state.loadingIds.filter((item) => item !== id);
      }
    },
    setNodeChildren(state, action: PayloadAction<{ children: ExplorerNode[]; id: string }>) {
      updateNodeChildrenRecursive(state.nodes, action.payload.id, action.payload.children);
      state.loadingIds = state.loadingIds.filter((item) => item !== action.payload.id);
    },
    setExplorerError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    resetExplorer() {
      return defaultExplorerState;
    },
  },
});

export const {
  collapseNode,
  expandNode,
  resetExplorer,
  selectNode,
  setExplorerError,
  setFilter,
  setNodeChildren,
  setNodeLoading,
  setNodes,
  toggleNode,
} = explorerSlice.actions;

export const explorerReducer = explorerSlice.reducer;
