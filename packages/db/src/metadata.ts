import type { ColumnInfo } from './generated/ColumnInfo';
import type { DatabaseInfo } from './generated/DatabaseInfo';
import type { ForeignKeyInfo } from './generated/ForeignKeyInfo';
import type { ProcedureInfo } from './generated/ProcedureInfo';
import type { TableInfo } from './generated/TableInfo';
import type { ViewInfo } from './generated/ViewInfo';

export type { ColumnInfo, DatabaseInfo, ForeignKeyInfo, ProcedureInfo, TableInfo, ViewInfo };

export type MetadataInvoker = <T>(command: string, payload?: unknown) => Promise<T>;

export function getDatabases(
  connectionId: string,
  invoke: MetadataInvoker,
): Promise<DatabaseInfo[]> {
  return invoke<DatabaseInfo[]>('get_databases', { connectionId });
}

export function getTables(
  connectionId: string,
  db: string,
  invoke: MetadataInvoker,
): Promise<TableInfo[]> {
  return invoke<TableInfo[]>('get_tables', { connectionId, db });
}

export function getViews(
  connectionId: string,
  db: string,
  invoke: MetadataInvoker,
): Promise<ViewInfo[]> {
  return invoke<ViewInfo[]>('get_views', { connectionId, db });
}

export function getProcedures(
  connectionId: string,
  db: string,
  invoke: MetadataInvoker,
): Promise<ProcedureInfo[]> {
  return invoke<ProcedureInfo[]>('get_procedures', { connectionId, db });
}

export function getColumns(
  connectionId: string,
  db: string,
  schema: string,
  table: string,
  invoke: MetadataInvoker,
): Promise<ColumnInfo[]> {
  return invoke<ColumnInfo[]>('get_columns', { connectionId, db, schema, table });
}

export function getForeignKeys(
  connectionId: string,
  db: string,
  invoke: MetadataInvoker,
): Promise<ForeignKeyInfo[]> {
  return invoke<ForeignKeyInfo[]>('get_foreign_keys', { connectionId, db });
}

export function invalidateMetadataCache(
  invoke: MetadataInvoker,
  connectionId?: string,
): Promise<void> {
  return invoke<void>('invalidate_metadata_cache', {
    connectionId: connectionId ?? null,
  });
}
