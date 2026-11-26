import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import type { SqlValueDto } from '../services/execution';

export interface ResultGridProps {
  columns: string[];
  onCopy?: (text: string) => void;
  rowHeight?: number;
  rows: SqlValueDto[][];
  viewportHeight?: number;
}

type GridSelection =
  | { colIndex: number; kind: 'cell'; rowIndex: number }
  | { kind: 'row'; rowIndex: number }
  | { colIndex: number; kind: 'column' }
  | null;

export function formatSqlCell(cell: SqlValueDto | undefined): {
  isNull: boolean;
  isNumeric: boolean;
  text: string;
} {
  if (!cell || cell.type === 'Null') {
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

interface ResultGridRowProps {
  activeColIndex: number | null;
  columnCount: number;
  gridTemplateColumns: string;
  isRowSelected: boolean;
  numericColumns: boolean[];
  onSelectCell: (rowIndex: number, colIndex: number) => void;
  onSelectRow: (rowIndex: number) => void;
  registerCellRef: (rowIndex: number, colIndex: number, element: HTMLDivElement | null) => void;
  row: SqlValueDto[];
  rowIndex: number;
  selectedColumnIndex: number | null;
  size: number;
  start: number;
}

const ResultGridRow = memo(function ResultGridRow({
  activeColIndex,
  columnCount,
  gridTemplateColumns,
  isRowSelected,
  numericColumns,
  onSelectCell,
  onSelectRow,
  registerCellRef,
  row,
  rowIndex,
  selectedColumnIndex,
  size,
  start,
}: ResultGridRowProps) {
  return (
    <div
      className="result-grid-row"
      role="row"
      aria-rowindex={rowIndex + 2}
      data-index={rowIndex}
      style={{
        gridTemplateColumns,
        height: `${size}px`,
        transform: `translateY(${start}px)`,
      }}
    >
      <button
        type="button"
        role="rowheader"
        aria-label={`Selecionar linha ${rowIndex + 1}`}
        aria-selected={isRowSelected}
        className={[
          'result-grid-cell',
          'result-grid-index',
          isRowSelected ? 'result-cell-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelectRow(rowIndex)}
      >
        {rowIndex + 1}
      </button>

      {Array.from({ length: columnCount }, (_, colIndex) => {
        const formatted = formatSqlCell(row[colIndex]);
        const isActiveCell = activeColIndex === colIndex;
        const selected = isRowSelected || isActiveCell || selectedColumnIndex === colIndex;
        const numeric = formatted.isNumeric || Boolean(numericColumns[colIndex]);

        return (
          <div
            key={colIndex}
            ref={(element) => registerCellRef(rowIndex, colIndex, element)}
            role="gridcell"
            aria-colindex={colIndex + 2}
            aria-selected={selected}
            tabIndex={isActiveCell ? 0 : -1}
            className={[
              'result-grid-cell',
              formatted.isNull ? 'result-cell-null' : '',
              numeric && !formatted.isNull ? 'result-cell-numeric' : '',
              selected ? 'result-cell-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelectCell(rowIndex, colIndex)}
          >
            {formatted.text}
          </div>
        );
      })}
    </div>
  );
});

export function ResultGrid({
  columns,
  onCopy,
  rowHeight = 28,
  rows,
  viewportHeight = 320,
}: ResultGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [selection, setSelection] = useState<GridSelection>(
    rows.length > 0 && columns.length > 0 ? { colIndex: 0, kind: 'cell', rowIndex: 0 } : null,
  );

  const numericColumns = useMemo(() => {
    const sampleLimit = Math.min(rows.length, 50);
    return columns.map((_, colIndex) => {
      for (let rowIndex = 0; rowIndex < sampleLimit; rowIndex += 1) {
        const cell = rows[rowIndex]?.[colIndex];
        if (!cell || cell.type === 'Null') continue;
        return cell.type === 'Int' || cell.type === 'Float' || cell.type === 'Decimal';
      }
      return false;
    });
  }, [columns, rows]);

  const gridTemplateColumns = useMemo(
    () => `48px repeat(${Math.max(columns.length, 1)}, minmax(120px, 1fr))`,
    [columns.length],
  );

  const getScrollElement = useCallback(() => scrollContainerRef.current, []);
  const estimateSize = useCallback(() => rowHeight, [rowHeight]);
  const initialRect = useMemo(() => ({ height: viewportHeight, width: 960 }), [viewportHeight]);

  const observeElementRect = useCallback(
    (
      instance: { scrollElement: HTMLDivElement | null },
      cb: (rect: { height: number; width: number }) => void,
    ) => {
      const element = instance.scrollElement;
      if (!element) return;
      const measure = () => {
        const rect = element.getBoundingClientRect();
        cb({
          height: rect.height > 0 ? rect.height : viewportHeight,
          width: rect.width > 0 ? rect.width : 960,
        });
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [viewportHeight],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize,
    getScrollElement,
    initialRect,
    observeElementRect,
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  const buildCopyText = useCallback((): string | null => {
    if (!selection) return null;

    if (selection.kind === 'cell') {
      const cell = rows[selection.rowIndex]?.[selection.colIndex];
      return formatSqlCell(cell).text;
    }

    if (selection.kind === 'row') {
      const row = rows[selection.rowIndex];
      if (!row) return null;
      return columns.map((_, colIdx) => formatSqlCell(row[colIdx]).text).join('\t');
    }

    return rows.map((row) => formatSqlCell(row[selection.colIndex]).text).join('\n');
  }, [columns, rows, selection]);

  const copySelection = useCallback(() => {
    const text = buildCopyText();
    if (text === null) return;
    void navigator.clipboard?.writeText(text);
    onCopy?.(text);
  }, [buildCopyText, onCopy]);

  const handleSelectCell = useCallback((rowIndex: number, colIndex: number) => {
    setSelection({ colIndex, kind: 'cell', rowIndex });
  }, []);

  const handleSelectRow = useCallback((rowIndex: number) => {
    setSelection({ kind: 'row', rowIndex });
  }, []);

  const registerCellRef = useCallback(
    (rowIndex: number, colIndex: number, element: HTMLDivElement | null) => {
      const key = `${rowIndex}:${colIndex}`;
      if (element) {
        cellRefs.current[key] = element;
      } else {
        delete cellRefs.current[key];
      }
    },
    [],
  );

  const moveFocusToCell = useCallback(
    (nextRow: number, nextCol: number) => {
      const clampedRow = Math.max(0, Math.min(rows.length - 1, nextRow));
      const clampedCol = Math.max(0, Math.min(columns.length - 1, nextCol));
      setSelection({ colIndex: clampedCol, kind: 'cell', rowIndex: clampedRow });
      rowVirtualizer.scrollToIndex(clampedRow);

      const key = `${clampedRow}:${clampedCol}`;
      cellRefs.current[key]?.focus();
    },
    [columns.length, rowVirtualizer, rows.length],
  );

  const handleGridKeyDown = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySelection();
      return;
    }

    if (rows.length === 0 || columns.length === 0) return;

    const currentRow = selection && selection.kind !== 'column' ? selection.rowIndex : 0;
    const currentCol = selection && selection.kind !== 'row' ? selection.colIndex : 0;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocusToCell(currentRow + 1, currentCol);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocusToCell(currentRow - 1, currentCol);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocusToCell(currentRow, currentCol + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocusToCell(currentRow, currentCol - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveFocusToCell(currentRow, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveFocusToCell(currentRow, columns.length - 1);
    }
  };

  const selectedColumnIndex = selection?.kind === 'column' ? selection.colIndex : null;

  return (
    <div
      ref={scrollContainerRef}
      className="result-grid-viewport"
      role="grid"
      aria-label="Resultados da consulta"
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length + 1}
      data-testid="result-grid"
      onKeyDown={handleGridKeyDown}
    >
      <div
        className="result-grid-header"
        role="row"
        aria-rowindex={1}
        style={{ gridTemplateColumns }}
      >
        <div className="result-grid-header-cell result-grid-index" role="columnheader">
          #
        </div>
        {columns.map((column, colIndex) => {
          const isColSelected = selectedColumnIndex === colIndex;
          return (
            <button
              key={`${column}-${colIndex}`}
              type="button"
              role="columnheader"
              aria-selected={isColSelected}
              className={[
                'result-grid-header-cell',
                numericColumns[colIndex] ? 'result-cell-numeric' : '',
                isColSelected ? 'result-cell-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelection({ colIndex, kind: 'column' })}
            >
              {column || `(sem nome ${colIndex + 1})`}
            </button>
          );
        })}
      </div>

      <div className="result-grid-body" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {virtualRows.map((virtualRow) => {
          const rowIndex = virtualRow.index;
          const row = rows[rowIndex] ?? [];
          const isRowSelected = selection?.kind === 'row' && selection.rowIndex === rowIndex;
          const activeColIndex =
            selection?.kind === 'cell' && selection.rowIndex === rowIndex
              ? selection.colIndex
              : null;

          return (
            <ResultGridRow
              key={virtualRow.key}
              activeColIndex={activeColIndex}
              columnCount={columns.length}
              gridTemplateColumns={gridTemplateColumns}
              isRowSelected={isRowSelected}
              numericColumns={numericColumns}
              onSelectCell={handleSelectCell}
              onSelectRow={handleSelectRow}
              registerCellRef={registerCellRef}
              row={row}
              rowIndex={rowIndex}
              selectedColumnIndex={selectedColumnIndex}
              size={virtualRow.size}
              start={virtualRow.start}
            />
          );
        })}
      </div>
    </div>
  );
}
