import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TabBar } from './TabBar';

const sampleTabs = [
  { dirty: false, id: 'query-1', sql: 'select 1', title: 'Consulta 01' },
  { dirty: true, id: 'query-2', sql: 'select 2', title: 'Consulta 02' },
];

describe('TabBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza abas com role tablist e aria-selected', () => {
    render(
      <TabBar
        activeTabId="query-1"
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
        onSelectTab={vi.fn()}
        tabs={sampleTabs}
      />,
    );

    const tablist = screen.getByRole('tablist', { name: 'Abas de consulta' });
    expect(tablist).not.toBeNull();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
  });

  it('permite alternar aba ativa ao clicar', () => {
    const onSelectTab = vi.fn();
    render(
      <TabBar
        activeTabId="query-1"
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
        onSelectTab={onSelectTab}
        tabs={sampleTabs}
      />,
    );

    fireEvent.click(screen.getAllByRole('tab')[1]!);
    expect(onSelectTab).toHaveBeenCalledWith('query-2');
  });

  it('chama onAddTab ao clicar no botão +', () => {
    const onAddTab = vi.fn();
    render(
      <TabBar
        activeTabId="query-1"
        onAddTab={onAddTab}
        onCloseTab={vi.fn()}
        onSelectTab={vi.fn()}
        tabs={sampleTabs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nova aba' }));
    expect(onAddTab).toHaveBeenCalledTimes(1);
  });

  it('fecha aba limpa diretamente sem confirmação', () => {
    const onCloseTab = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(
      <TabBar
        activeTabId="query-1"
        onAddTab={vi.fn()}
        onCloseTab={onCloseTab}
        onSelectTab={vi.fn()}
        tabs={sampleTabs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Consulta 01' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onCloseTab).toHaveBeenCalledWith('query-1');

    confirmSpy.mockRestore();
  });

  it('exibe confirmação ao tentar fechar aba com dirty', () => {
    const onCloseTab = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <TabBar
        activeTabId="query-2"
        onAddTab={vi.fn()}
        onCloseTab={onCloseTab}
        onSelectTab={vi.fn()}
        tabs={sampleTabs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Consulta 02' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onCloseTab).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Consulta 02' }));
    expect(onCloseTab).toHaveBeenCalledWith('query-2');

    confirmSpy.mockRestore();
  });

  it('navega entre abas com setas do teclado', () => {
    const onSelectTab = vi.fn();
    render(
      <TabBar
        activeTabId="query-1"
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
        onSelectTab={onSelectTab}
        tabs={sampleTabs}
      />,
    );

    const firstTab = screen.getAllByRole('tab')[0]!;
    fireEvent.keyDown(firstTab, { key: 'ArrowRight' });
    expect(onSelectTab).toHaveBeenCalledWith('query-2');
  });

  it('responde aos atalhos globais Ctrl+T, Ctrl+W e Ctrl+Tab', () => {
    const onAddTab = vi.fn();
    const onCloseTab = vi.fn();
    const onSelectTab = vi.fn();

    render(
      <TabBar
        activeTabId="query-1"
        onAddTab={onAddTab}
        onCloseTab={onCloseTab}
        onSelectTab={onSelectTab}
        tabs={sampleTabs}
      />,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 't' });
    expect(onAddTab).toHaveBeenCalled();

    fireEvent.keyDown(window, { ctrlKey: true, key: 'w' });
    expect(onCloseTab).toHaveBeenCalledWith('query-1');

    fireEvent.keyDown(window, { ctrlKey: true, key: 'Tab' });
    expect(onSelectTab).toHaveBeenCalledWith('query-2');
  });
});
