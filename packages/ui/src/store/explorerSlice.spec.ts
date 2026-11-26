import { describe, expect, it } from 'vitest';

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
  setNodes,
  toggleNode,
  type ExplorerNode,
} from './explorerSlice';

describe('explorerSlice', () => {
  it('gerencia expansão, recolhimento e alternância de nós', () => {
    let state = explorerReducer(defaultExplorerState, collapseNode('db:default:folder:tables'));
    expect(state.expandedIds).not.toContain('db:default:folder:tables');

    state = explorerReducer(state, expandNode('db:default:folder:views'));
    expect(state.expandedIds).toContain('db:default:folder:views');

    state = explorerReducer(state, toggleNode('db:default:folder:views'));
    expect(state.expandedIds).not.toContain('db:default:folder:views');

    state = explorerReducer(state, toggleNode('db:default:folder:views'));
    expect(state.expandedIds).toContain('db:default:folder:views');
  });

  it('seleciona nó, aplica filtro e gerencia estado de carregamento e erro', () => {
    let state = explorerReducer(
      defaultExplorerState,
      selectNode('db:default:table:dbo.TBResultados'),
    );
    expect(state.selectedId).toBe('db:default:table:dbo.TBResultados');

    state = explorerReducer(state, setFilter('Clientes'));
    expect(state.filter).toBe('Clientes');

    state = explorerReducer(
      state,
      setNodeLoading({ id: 'db:default:table:dbo.TBResultados', loading: true }),
    );
    expect(state.loadingIds).toContain('db:default:table:dbo.TBResultados');

    state = explorerReducer(state, setExplorerError('Falha ao carregar colunas'));
    expect(state.error).toBe('Falha ao carregar colunas');
  });

  it('injeta filhos carregados sob demanda e marca nó como loaded', () => {
    const columns: ExplorerNode[] = [
      {
        dataType: 'int',
        hasChildren: false,
        id: 'col:id',
        isPrimaryKey: true,
        kind: 'column',
        label: 'Id',
        loaded: true,
      },
    ];

    let state = explorerReducer(
      defaultExplorerState,
      setNodeLoading({ id: 'db:default:table:dbo.TBResultados', loading: true }),
    );
    state = explorerReducer(
      state,
      setNodeChildren({ children: columns, id: 'db:default:table:dbo.TBResultados' }),
    );

    expect(state.loadingIds).not.toContain('db:default:table:dbo.TBResultados');
    const tablesFolder = state.nodes[0]?.children?.[0];
    const targetTable = tablesFolder?.children?.[0];
    expect(targetTable?.loaded).toBe(true);
    expect(targetTable?.children).toEqual(columns);
  });

  it('substitui árvore completa via setNodes limpando erros anteriores', () => {
    const customNodes: ExplorerNode[] = [
      {
        database: 'Vendas',
        hasChildren: true,
        id: 'db:Vendas',
        kind: 'database',
        label: 'Vendas',
        loaded: false,
      },
    ];

    let state = explorerReducer(defaultExplorerState, setExplorerError('erro antigo'));
    state = explorerReducer(state, setNodes(customNodes));

    expect(state.nodes).toEqual(customNodes);
    expect(state.error).toBeNull();
  });
});
