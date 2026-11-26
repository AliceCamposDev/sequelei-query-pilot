import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectionManagerDialog } from './ConnectionManagerDialog';

import type { ConnectionSummary } from '../services/connections';

const SAMPLE_CONNECTION: ConnectionSummary = {
  authType: 'sql',
  createdAt: '2026-11-25 22:00:00',
  database: 'master',
  encrypt: true,
  environment: 'dev',
  host: 'localhost',
  id: 'conn-local-1',
  name: 'Local SQL',
  port: 1433,
  trustServerCertificate: true,
  username: 'sa',
};

describe('ConnectionManagerDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('lista conexões salvas, testa conexão e permite fechar com Esc', async () => {
    const onClose = vi.fn();
    const onTestConnection = vi.fn(async () => ({
      latencyMs: 11,
      message: 'Conexão validada com sucesso',
      ok: true,
    }));

    render(
      <ConnectionManagerDialog
        activeConnectionId={null}
        connections={[SAMPLE_CONNECTION]}
        error={null}
        isOpen
        loading={false}
        onClose={onClose}
        onCreateConnection={vi.fn()}
        onCreateDatabase={vi.fn()}
        onDeleteConnection={vi.fn()}
        onSelectConnection={vi.fn()}
        onTestConnection={onTestConnection}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Gerenciar conexões SQL Server' })).not.toBeNull();
    expect(screen.getByText('Local SQL')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));
    await waitFor(() => {
      expect(screen.getByText('OK (11ms)')).not.toBeNull();
    });
    expect(onTestConnection).toHaveBeenCalledWith('conn-local-1');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cria nova conexão SQL e conecta automaticamente ao salvar', async () => {
    const onCreateConnection = vi.fn(async () => SAMPLE_CONNECTION);
    const onSelectConnection = vi.fn();

    render(
      <ConnectionManagerDialog
        activeConnectionId={null}
        connections={[]}
        error={null}
        isOpen
        loading={false}
        onClose={vi.fn()}
        onCreateConnection={onCreateConnection}
        onCreateDatabase={vi.fn()}
        onDeleteConnection={vi.fn()}
        onSelectConnection={onSelectConnection}
        onTestConnection={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nome da conexão'), {
      target: { value: 'Local SQL' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'StrongPass#123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conectar' }));

    await waitFor(() => {
      expect(onCreateConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { password: 'StrongPass#123', type: 'sql', user: 'sa' },
          host: 'localhost',
          name: 'Local SQL',
          port: 1433,
        }),
      );
    });
    expect(onSelectConnection).toHaveBeenCalledWith(SAMPLE_CONNECTION);
  });

  it('cria novo banco de dados na conexão ativa e exibe confirmação', async () => {
    const onCreateDatabase = vi.fn(async () => undefined);

    render(
      <ConnectionManagerDialog
        activeConnectionId="conn-local-1"
        connections={[SAMPLE_CONNECTION]}
        error={null}
        isOpen
        loading={false}
        onClose={vi.fn()}
        onCreateConnection={vi.fn()}
        onCreateDatabase={onCreateDatabase}
        onDeleteConnection={vi.fn()}
        onSelectConnection={vi.fn()}
        onTestConnection={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Nome do novo banco/i), {
      target: { value: 'SequeleiAnalytics' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar banco' }));

    await waitFor(() => {
      expect(onCreateDatabase).toHaveBeenCalledWith('conn-local-1', 'SequeleiAnalytics');
    });
    expect(screen.getByRole('status').textContent).toContain('SequeleiAnalytics');
  });
});
