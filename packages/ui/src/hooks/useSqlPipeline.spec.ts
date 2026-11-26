import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSqlPipeline } from './useSqlPipeline';

describe('useSqlPipeline', () => {
  it('prepara uma query simples usando o pipeline real do core', () => {
    const { result } = renderHook(() => useSqlPipeline());
    const prepared = result.current.prepareSql('select 1');

    expect(prepared).toEqual({
      commandKind: 'read',
      executableSql: 'select 1',
      formattedSql: 'select 1',
      nolockApplied: false,
      warnings: [],
    });
  });

  it('aplica nolock e formata select com tabela via pipeline do core', () => {
    const { result } = renderHook(() => useSqlPipeline());
    const prepared = result.current.prepareSql('SELECT Nome FROM dbo.Clientes WHERE Ativo = 1', {
      applyNolock: true,
    });

    expect(prepared.commandKind).toBe('read');
    expect(prepared.nolockApplied).toBe(true);
    expect(prepared.executableSql).toBe(
      'SELECT Nome FROM dbo.Clientes with (nolock) WHERE Ativo = 1',
    );
    expect(prepared.formattedSql).toBe(
      'select Nome\nfrom dbo.Clientes with (nolock)\nwhere Ativo = 1',
    );
    expect(result.current.formatSQL('SELECT 1')).toBe('select 1');
  });
});
