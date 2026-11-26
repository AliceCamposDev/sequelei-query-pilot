import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResultGrid } from './ResultGrid';

import type { SqlValueDto } from '../services/execution';

function createRows(count: number): SqlValueDto[][] {
  return Array.from({ length: count }, (_, index) => [
    { type: 'Int', value: index + 1 },
    { type: 'Text', value: `Cliente ${index + 1}` },
    { type: 'Decimal', value: `${(index + 1) * 10}.50` },
    index % 2 === 0 ? { type: 'Null' } : { type: 'Text', value: 'Ativo' },
  ]);
}

describe('ResultGrid (virtualizado)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renderiza apenas as linhas visíveis (windowing) mesmo com 10.000 linhas', () => {
    const rows = createRows(10_000);

    render(
      <ResultGrid columns={['Id', 'Nome', 'Saldo', 'Obs']} rows={rows} viewportHeight={280} />,
    );

    // 1 linha de cabeçalho + ~10 linhas visíveis + overscan (muito abaixo de 10.000)
    const renderedRows = screen.getAllByRole('row');
    expect(renderedRows.length).toBeGreaterThan(5);
    expect(renderedRows.length).toBeLessThan(40);
    expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('10001');
  });

  it('alinha colunas numéricas à direita, renderiza NULL em itálico e mantém cabeçalho sticky', () => {
    const rows = createRows(3);

    render(<ResultGrid columns={['Id', 'Nome', 'Saldo', 'Obs']} rows={rows} />);

    const headerRow = screen.getAllByRole('row')[0]!;
    expect(headerRow.className).toContain('result-grid-header');

    const numericHeader = screen.getByRole('columnheader', { name: 'Id' });
    expect(numericHeader.className).toContain('result-cell-numeric');

    const numericCell = screen.getByText('10.50');
    expect(numericCell.className).toContain('result-cell-numeric');

    const nullCells = screen.getAllByText('NULL');
    expect(nullCells[0]?.className).toContain('result-cell-null');
  });

  it('copia célula, linha e coluna com Ctrl+C', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const rows = createRows(3);
    render(<ResultGrid columns={['Id', 'Nome', 'Saldo', 'Obs']} rows={rows} />);

    const grid = screen.getByRole('grid');

    // 1. Copiar célula
    const cellNome2 = screen.getByText('Cliente 2');
    fireEvent.click(cellNome2);
    fireEvent.keyDown(grid, { ctrlKey: true, key: 'c' });
    expect(writeText).toHaveBeenLastCalledWith('Cliente 2');

    // 2. Copiar linha completa (separada por tab)
    fireEvent.click(screen.getByRole('rowheader', { name: 'Selecionar linha 1' }));
    fireEvent.keyDown(grid, { ctrlKey: true, key: 'c' });
    expect(writeText).toHaveBeenLastCalledWith('1\tCliente 1\t10.50\tNULL');

    // 3. Copiar coluna completa (separada por quebra de linha)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Nome' }));
    fireEvent.keyDown(grid, { ctrlKey: true, key: 'c' });
    expect(writeText).toHaveBeenLastCalledWith('Cliente 1\nCliente 2\nCliente 3');
  });

  it('suporta navegação por teclado célula a célula (setas, Home e End)', () => {
    const rows = createRows(4);
    render(<ResultGrid columns={['Id', 'Nome', 'Saldo', 'Obs']} rows={rows} />);

    const grid = screen.getByRole('grid');
    const cells = screen.getAllByRole('gridcell');
    const firstCell = cells[0]!;
    fireEvent.click(firstCell);
    expect(firstCell.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(screen.getByText('Cliente 1').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(screen.getByText('Cliente 2').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(grid, { key: 'End' });
    expect(screen.getAllByText('Ativo')[0]?.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(grid, { key: 'Home' });
    expect(cells[4]?.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(firstCell.getAttribute('aria-selected')).toBe('true');
  });

  it('mantém performance de scroll compatível com 60fps em 100k linhas', () => {
    const rows = createRows(100_000);
    render(
      <ResultGrid columns={['Id', 'Nome', 'Saldo', 'Obs']} rows={rows} viewportHeight={320} />,
    );

    const viewport = screen.getByRole('grid');
    const frames = 20;
    const startedAt = performance.now();

    for (let step = 1; step <= frames; step += 1) {
      viewport.scrollTop = step * 56;
      fireEvent.scroll(viewport);
    }

    const avgFrameMs = (performance.now() - startedAt) / frames;
    expect(avgFrameMs).toBeLessThan(16.67);
  });
});
