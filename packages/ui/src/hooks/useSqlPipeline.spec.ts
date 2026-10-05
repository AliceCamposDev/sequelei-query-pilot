import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSqlPipeline } from './useSqlPipeline';

describe('useSqlPipeline', () => {
  it('prepara uma query fake usando o contrato do core', () => {
    const { result } = renderHook(() => useSqlPipeline());
    const prepared = result.current.prepareSql('select 1');

    expect(prepared).toEqual({
      executableSql: 'select 1',
      formattedSql: 'select 1',
      warnings: [],
    });
  });
});
