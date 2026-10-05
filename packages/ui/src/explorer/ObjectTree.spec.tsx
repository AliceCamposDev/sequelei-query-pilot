import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ObjectTree } from './ObjectTree';

describe('ObjectTree', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza os nós de banco de dados e tabelas', () => {
    render(<ObjectTree onAskAi={vi.fn()} onSelectTop1000={vi.fn()} />);

    expect(screen.getByText('Banco de dados')).not.toBeNull();
    expect(screen.getByText('TBResultados')).not.toBeNull();
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
