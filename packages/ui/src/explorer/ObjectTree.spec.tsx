import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ObjectTree } from './ObjectTree';

import type { MetadataInvoker } from '../../../db/src/metadata';
import type { ExplorerNode } from '../store/explorerSlice';

const FAKE_TREE: ExplorerNode[] = [
  {
    children: [
      {
        children: [
          {
            database: 'Vendas',
            hasChildren: true,
            id: 'tbl-clientes',
            kind: 'table',
            label: 'Clientes',
            loaded: false,
            schema: 'dbo',
          },
          {
            database: 'Vendas',
            hasChildren: true,
            id: 'tbl-pedidos',
            kind: 'table',
            label: 'Pedidos',
            loaded: false,
            schema: 'dbo',
          },
        ],
        database: 'Vendas',
        folderType: 'tables',
        hasChildren: true,
        id: 'folder-tables',
        kind: 'folder',
        label: 'Tabelas',
        loaded: true,
      },
    ],
    database: 'Vendas',
    hasChildren: true,
    id: 'db-vendas',
    kind: 'database',
    label: 'Vendas',
    loaded: true,
  },
];

describe('ObjectTree', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza os nós padrão de banco de dados e tabelas', () => {
    render(<ObjectTree onAskAi={vi.fn()} onSelectTop1000={vi.fn()} />);

    expect(screen.getByText('Banco de dados')).not.toBeNull();
    expect(screen.getByText('TBResultados')).not.toBeNull();
  });

  it('renderiza dados fake e expande nó para exibir filhos com atributos ARIA corretos', () => {
    render(<ObjectTree initialNodes={FAKE_TREE} onAskAi={vi.fn()} onSelectTop1000={vi.fn()} />);

    const dbItem = screen.getByRole('treeitem', { name: /Vendas/ });
    expect(dbItem.getAttribute('aria-expanded')).toBe('false');
    expect(dbItem.getAttribute('aria-level')).toBe('1');
    expect(screen.queryByRole('treeitem', { name: /Tabelas/ })).toBeNull();

    fireEvent.click(dbItem);
    expect(dbItem.getAttribute('aria-expanded')).toBe('true');

    const folderItem = screen.getByRole('treeitem', { name: /Tabelas/ });
    expect(folderItem.getAttribute('aria-level')).toBe('2');

    fireEvent.click(folderItem);
    const tableItem = screen.getByRole('treeitem', { name: /Clientes/ });
    expect(tableItem.getAttribute('aria-level')).toBe('3');
  });

  it('seleciona tabela ao clicar e notifica onSelectNode', () => {
    const onSelectNode = vi.fn();
    render(
      <ObjectTree
        initialExpandedIds={['db-vendas', 'folder-tables']}
        initialNodes={FAKE_TREE}
        onAskAi={vi.fn()}
        onSelectNode={onSelectNode}
        onSelectTop1000={vi.fn()}
      />,
    );

    const tableItem = screen.getByRole('treeitem', { name: /Pedidos/ });
    expect(tableItem.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(tableItem);

    expect(tableItem.getAttribute('aria-selected')).toBe('true');
    expect(onSelectNode).toHaveBeenCalledWith(expect.objectContaining({ id: 'tbl-pedidos' }));
  });

  it('carrega filhos sob demanda (lazy loading) apenas ao expandir o nó', async () => {
    const loadChildren = vi.fn(async (node: ExplorerNode): Promise<ExplorerNode[]> => {
      if (node.id === 'tbl-clientes') {
        return [
          {
            dataType: 'int',
            hasChildren: false,
            id: 'col-cliente-id',
            isPrimaryKey: true,
            kind: 'column',
            label: 'ClienteID',
            loaded: true,
          },
          {
            dataType: 'nvarchar',
            hasChildren: false,
            id: 'col-nome',
            isPrimaryKey: false,
            kind: 'column',
            label: 'Nome',
            loaded: true,
          },
        ];
      }
      return [];
    });

    render(
      <ObjectTree
        initialExpandedIds={['db-vendas', 'folder-tables']}
        initialNodes={FAKE_TREE}
        loadChildren={loadChildren}
        onAskAi={vi.fn()}
        onSelectTop1000={vi.fn()}
      />,
    );

    // Filhos não devem carregar antes da expansão
    expect(loadChildren).not.toHaveBeenCalled();

    const clientesItem = screen.getByRole('treeitem', { name: /Clientes/ });
    fireEvent.click(clientesItem);

    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: /ClienteID/ })).not.toBeNull();
    });
    expect(loadChildren).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PK')).not.toBeNull();
    expect(screen.getByText('nvarchar')).not.toBeNull();

    // Recolher e reabrir não deve chamar o loader novamente
    fireEvent.click(clientesItem);
    fireEvent.click(clientesItem);
    expect(loadChildren).toHaveBeenCalledTimes(1);
  });

  it('filtra objetos por nome e expande automaticamente os nós correspondentes', () => {
    render(<ObjectTree initialNodes={FAKE_TREE} onAskAi={vi.fn()} onSelectTop1000={vi.fn()} />);

    const searchInput = screen.getByRole('searchbox', { name: 'Filtrar objetos' });
    fireEvent.change(searchInput, { target: { value: 'Pedid' } });

    expect(screen.getByRole('treeitem', { name: /Pedidos/ })).not.toBeNull();
    expect(screen.queryByRole('treeitem', { name: /Clientes/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro' }));
    expect(searchInput.getAttribute('value')).toBe('');
  });

  it('sincroniza colunas sob demanda via comandos Tauri quando connectionId é fornecido', async () => {
    const metadataInvoker = vi.fn(async (command: string) => {
      if (command === 'get_columns') {
        return [
          {
            dataType: 'bigint',
            isNullable: false,
            isPrimaryKey: true,
            maxLength: 8,
            name: 'PedidoID',
            precision: 19,
            scale: 0,
          },
        ];
      }
      return [];
    }) as unknown as MetadataInvoker;

    render(
      <ObjectTree
        connectionId="conn-dev"
        initialExpandedIds={['db-vendas', 'folder-tables']}
        initialNodes={FAKE_TREE}
        metadataInvoker={metadataInvoker}
        onAskAi={vi.fn()}
        onSelectTop1000={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('treeitem', { name: /Pedidos/ }));

    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: /PedidoID/ })).not.toBeNull();
    });
    expect(metadataInvoker).toHaveBeenCalledWith('get_columns', {
      connectionId: 'conn-dev',
      db: 'Vendas',
      schema: 'dbo',
      table: 'Pedidos',
    });
  });

  it('suporta navegação completa por teclado com setas (up/down/left/right) e Enter', () => {
    render(<ObjectTree initialNodes={FAKE_TREE} onAskAi={vi.fn()} onSelectTop1000={vi.fn()} />);

    const dbItem = screen.getByRole('treeitem', { name: /Vendas/ });
    dbItem.focus();

    // ArrowRight expande Vendas
    fireEvent.keyDown(dbItem, { key: 'ArrowRight' });
    expect(dbItem.getAttribute('aria-expanded')).toBe('true');

    // ArrowDown move foco para Tabelas
    fireEvent.keyDown(dbItem, { key: 'ArrowDown' });
    const folderItem = screen.getByRole('treeitem', { name: /Tabelas/ });
    expect(document.activeElement).toBe(folderItem);

    // Enter seleciona e expande Tabelas
    fireEvent.keyDown(folderItem, { key: 'Enter' });
    expect(folderItem.getAttribute('aria-expanded')).toBe('true');
    expect(folderItem.getAttribute('aria-selected')).toBe('true');

    // ArrowRight em nó já expandido vai para o primeiro filho (Clientes)
    fireEvent.keyDown(folderItem, { key: 'ArrowRight' });
    const clientesItem = screen.getByRole('treeitem', { name: /Clientes/ });
    expect(document.activeElement).toBe(clientesItem);

    // ArrowDown vai para Pedidos; ArrowUp volta para Clientes
    fireEvent.keyDown(clientesItem, { key: 'ArrowDown' });
    const pedidosItem = screen.getByRole('treeitem', { name: /Pedidos/ });
    expect(document.activeElement).toBe(pedidosItem);

    fireEvent.keyDown(pedidosItem, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(clientesItem);

    // ArrowLeft em folha fechada retorna foco ao pai (Tabelas)
    fireEvent.keyDown(clientesItem, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(folderItem);

    // ArrowLeft em nó aberto recolhe Tabelas
    fireEvent.keyDown(folderItem, { key: 'ArrowLeft' });
    expect(folderItem.getAttribute('aria-expanded')).toBe('false');
  });

  it('abre menu de contexto com 5 itens esperados ao clicar com botão direito na tabela', () => {
    render(<ObjectTree onAskAi={vi.fn()} onSelectTop1000={vi.fn()} />);

    const tableItem = screen.getByText('TBResultados');
    fireEvent.contextMenu(tableItem, { clientX: 120, clientY: 200 });

    expect(screen.getByRole('menu')).not.toBeNull();
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(5);
    expect(items[0]?.textContent).toContain('select top 1000 *');
    expect(items[1]?.textContent).toContain('Gerar script CREATE TABLE');
    expect(items[2]?.textContent).toContain('Gerar script INSERT');
    expect(items[3]?.textContent).toContain('Copiar nome completo');
    expect(items[4]?.textContent).toContain('Perguntar à IA');
  });

  it('aciona onSelectTop1000 ao clicar na ação correspondente', () => {
    const onSelectTop1000 = vi.fn();
    render(<ObjectTree onAskAi={vi.fn()} onSelectTop1000={onSelectTop1000} />);

    fireEvent.contextMenu(screen.getByText('TBResultados'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'select top 1000 *' }));

    expect(onSelectTop1000).toHaveBeenCalledWith('dbo', 'TBResultados');
  });

  it('aciona onAskAi com a mensagem correta ao clicar em Perguntar à IA', () => {
    const onAskAi = vi.fn();
    render(<ObjectTree onAskAi={onAskAi} onSelectTop1000={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText('TBResultados'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Perguntar à IA' }));

    expect(onAskAi).toHaveBeenCalledWith(
      'Descreva a tabela dbo.TBResultados e sugira consultas úteis.',
    );
  });
});
