import {
  getColumns,
  getDatabases,
  getProcedures,
  getTables,
  getViews,
  invalidateMetadataCache,
  type MetadataInvoker,
} from '../../../db/src/metadata';

import type { ExplorerNode } from '../store/explorerSlice';

const defaultMetadataInvoker: MetadataInvoker = async <T>(command: string, payload?: unknown) => {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    throw new Error('Bridge Tauri indisponível para carregar metadados.');
  }

  return invoke<T>(command, payload);
};

export async function loadExplorerDatabases(
  connectionId: string,
  invoke: MetadataInvoker = defaultMetadataInvoker,
): Promise<ExplorerNode[]> {
  const databases = await getDatabases(connectionId, invoke);

  return databases.map((db) => ({
    database: db.name,
    hasChildren: true,
    id: `db:${db.name}`,
    kind: 'database',
    label: db.name,
    loaded: false,
  }));
}

export async function loadExplorerNodeChildren(
  node: ExplorerNode,
  connectionId: string,
  invoke: MetadataInvoker = defaultMetadataInvoker,
): Promise<ExplorerNode[]> {
  if (node.kind === 'database') {
    const dbName = node.database ?? node.label;
    return [
      {
        database: dbName,
        folderType: 'tables',
        hasChildren: true,
        id: `${node.id}:folder:tables`,
        kind: 'folder',
        label: 'Tabelas',
        loaded: false,
      },
      {
        database: dbName,
        folderType: 'views',
        hasChildren: true,
        id: `${node.id}:folder:views`,
        kind: 'folder',
        label: 'Views',
        loaded: false,
      },
      {
        database: dbName,
        folderType: 'procedures',
        hasChildren: true,
        id: `${node.id}:folder:procedures`,
        kind: 'folder',
        label: 'Procedures',
        loaded: false,
      },
    ];
  }

  if (node.kind === 'folder' && node.database) {
    if (node.folderType === 'tables') {
      const tables = await getTables(connectionId, node.database, invoke);
      return tables.map((table) => ({
        database: node.database!,
        hasChildren: true,
        id: `db:${node.database}:table:${table.schema}.${table.name}`,
        kind: 'table',
        label: table.name,
        loaded: false,
        schema: table.schema,
      }));
    }

    if (node.folderType === 'views') {
      const views = await getViews(connectionId, node.database, invoke);
      return views.map((view) => ({
        database: node.database!,
        hasChildren: true,
        id: `db:${node.database}:view:${view.schema}.${view.name}`,
        kind: 'view',
        label: view.name,
        loaded: false,
        schema: view.schema,
      }));
    }

    if (node.folderType === 'procedures') {
      const procedures = await getProcedures(connectionId, node.database, invoke);
      return procedures.map((proc) => ({
        database: node.database!,
        hasChildren: false,
        id: `db:${node.database}:proc:${proc.schema}.${proc.name}`,
        kind: 'procedure',
        label: proc.name,
        loaded: true,
        schema: proc.schema,
      }));
    }
  }

  if ((node.kind === 'table' || node.kind === 'view') && node.database && node.schema) {
    const columns = await getColumns(connectionId, node.database, node.schema, node.label, invoke);
    return columns.map((column) => ({
      dataType: column.dataType,
      database: node.database!,
      hasChildren: false,
      id: `${node.id}:col:${column.name}`,
      isPrimaryKey: column.isPrimaryKey,
      kind: 'column',
      label: column.name,
      loaded: true,
      schema: node.schema!,
    }));
  }

  return [];
}

export function refreshMetadataCache(
  connectionId?: string,
  invoke: MetadataInvoker = defaultMetadataInvoker,
): Promise<void> {
  return invalidateMetadataCache(invoke, connectionId);
}
