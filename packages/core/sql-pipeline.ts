export interface PrepareSqlOptions {
  applyNolock?: boolean;
}

export interface PreparedSql {
  executableSql: string;
  formattedSql: string;
  warnings: string[];
}

/** Public pipeline contract; transformations will be composed in later tasks. */
export function prepareSql(rawSql: string, options: PrepareSqlOptions = {}): PreparedSql {
  void options;

  return {
    executableSql: rawSql,
    formattedSql: rawSql,
    warnings: [],
  };
}
