import { tokenize } from '@sequelei/core';

import type * as Monaco from 'monaco-editor';

export const SQL_THEME_DARK = 'sequelei-dark';
export const SQL_THEME_LIGHT = 'sequelei-light';
export const SQL_THEME = SQL_THEME_DARK;

class SqlLineState implements Monaco.languages.IState {
  clone(): Monaco.languages.IState {
    return new SqlLineState();
  }

  equals(other: Monaco.languages.IState): boolean {
    return other instanceof SqlLineState;
  }
}

export function createSqlTokensProvider(): Monaco.languages.TokensProvider {
  return {
    getInitialState: () => new SqlLineState(),
    tokenize: (line: string, state: Monaco.languages.IState) => {
      const tokens = tokenize(line);
      return {
        endState: state.clone(),
        tokens: tokens.map((token) => ({
          scopes: token.kind,
          startIndex: token.start,
        })),
      };
    },
  };
}

export function configureMonaco(monaco: typeof Monaco) {
  monaco.editor.defineTheme(SQL_THEME_DARK, {
    base: 'vs-dark',
    colors: {
      'editor.background': '#0b0814',
      'editorCursor.foreground': '#a994f2',
      editorForeground: '#e9e3f0',
      'editorLineNumber.foreground': '#9f93ae',
    },
    inherit: true,
    rules: [
      { foreground: 'a994f2', token: 'keyword' },
      { foreground: 'fc97b6', token: 'string' },
      { foreground: 'acaad1', token: 'number' },
      { foreground: '9f93ae', token: 'comment' },
      { foreground: 'e9e3f0', token: 'function' },
      { foreground: '9f93ae', token: 'operator' },
      { foreground: 'fc97b6', token: 'nolock' },
    ],
  });

  monaco.editor.defineTheme(SQL_THEME_LIGHT, {
    base: 'vs',
    colors: {
      'editor.background': '#ffffff',
      'editorCursor.foreground': '#a994f2',
      editorForeground: '#171128',
      'editorLineNumber.foreground': '#9f93ae',
    },
    inherit: true,
    rules: [
      { foreground: '6d4fd6', token: 'keyword' },
      { foreground: 'c9457a', token: 'string' },
      { foreground: '5b4bb8', token: 'number' },
      { foreground: '8a7fa8', token: 'comment' },
      { foreground: '171128', token: 'function' },
      { foreground: '8a7fa8', token: 'operator' },
      { foreground: 'c9457a', token: 'nolock' },
    ],
  });

  // Alias retrocompatível com testes e referências antigas
  monaco.editor.defineTheme('sequelei-sql', {
    base: 'vs-dark',
    colors: {
      'editor.background': '#0b0814',
      'editorCursor.foreground': '#a994f2',
      editorForeground: '#e9e3f0',
      'editorLineNumber.foreground': '#9f93ae',
    },
    inherit: true,
    rules: [
      { foreground: 'a994f2', token: 'keyword' },
      { foreground: 'fc97b6', token: 'string' },
      { foreground: 'acaad1', token: 'number' },
      { foreground: '9f93ae', token: 'comment' },
      { foreground: 'e9e3f0', token: 'function' },
      { foreground: 'fc97b6', token: 'nolock' },
    ],
  });

  if (monaco.languages?.setTokensProvider) {
    monaco.languages.setTokensProvider('sql', createSqlTokensProvider());
  }
}
