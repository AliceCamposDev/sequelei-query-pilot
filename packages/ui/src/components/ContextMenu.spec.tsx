import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextMenu } from './ContextMenu';

describe('ContextMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('não renderiza nada quando isOpen for false', () => {
    render(
      <ContextMenu
        isOpen={false}
        items={[{ action: vi.fn(), id: 'item-1', label: 'Item 1' }]}
        onClose={vi.fn()}
        position={{ x: 10, y: 10 }}
      />,
    );

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renderiza os itens quando aberto com role menu e menuitem', () => {
    render(
      <ContextMenu
        isOpen={true}
        items={[
          { action: vi.fn(), id: '1', label: 'select top 1000 *' },
          { action: vi.fn(), id: '2', label: 'Perguntar à IA' },
        ]}
        onClose={vi.fn()}
        position={{ x: 100, y: 150 }}
      />,
    );

    expect(screen.getByRole('menu')).not.toBeNull();
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('select top 1000 *');
    expect(items[1]?.textContent).toContain('Perguntar à IA');
  });

  it('executa a ação do item e fecha o menu ao clicar', () => {
    const action = vi.fn();
    const onClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        items={[{ action, id: '1', label: 'Ação de teste' }]}
        onClose={onClose}
        position={{ x: 10, y: 10 }}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ação de teste' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fecha o menu ao pressionar a tecla Escape', () => {
    const onClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        items={[{ action: vi.fn(), id: '1', label: 'Item 1' }]}
        onClose={onClose}
        position={{ x: 10, y: 10 }}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('permite navegar entre itens com as setas para baixo e para cima', () => {
    render(
      <ContextMenu
        isOpen={true}
        items={[
          { action: vi.fn(), id: '1', label: 'Primeiro' },
          { action: vi.fn(), id: '2', label: 'Segundo' },
        ]}
        onClose={vi.fn()}
        position={{ x: 10, y: 10 }}
      />,
    );

    const first = screen.getByRole('menuitem', { name: 'Primeiro' });
    const second = screen.getByRole('menuitem', { name: 'Segundo' });

    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(second, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });
});
