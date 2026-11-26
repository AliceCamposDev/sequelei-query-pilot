import { formatSQL, prepareSql } from '@sequelei/core';

export function useSqlPipeline() {
  return { formatSQL, prepareSql };
}
