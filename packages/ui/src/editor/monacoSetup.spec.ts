import { describe, expect, it, vi } from 'vitest';

import {
  configureMonaco,
  createSqlTokensProvider,
  SQL_THEME_DARK,
  SQL_THEME_LIGHT,
} from './monacoSetup';

import type * as Monaco from 'monaco-editor';

interface ThemeRule {
  foreground?: string;
  token?: string;
}

interface ThemeDefinition {
  rules: ThemeRule[];
}

describe('monacoSetup', () => {
  it('registra temas dark e light com cores da paleta e regra para nolock', () => {
    const definedThemes: Record<string, ThemeDefinition> = {};
    const mockMonaco = {
      editor: {
        defineTheme: vi.fn((name: string, data: ThemeDefinition) => {
          definedThemes[name] = data;
        }),
      },
      languages: {
        setTokensProvider: vi.fn(),
      },
    };

    configureMonaco(mockMonaco as unknown as typeof Monaco);

    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(SQL_THEME_DARK, expect.anything());
    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(SQL_THEME_LIGHT, expect.anything());

    const darkRules = definedThemes[SQL_THEME_DARK]?.rules ?? [];
    const darkNolockRule = darkRules.find((rule) => rule.token === 'nolock');
    expect(darkNolockRule).toBeDefined();
    expect(darkNolockRule?.foreground).toBe('fc97b6');

    const lightRules = definedThemes[SQL_THEME_LIGHT]?.rules ?? [];
    const lightNolockRule = lightRules.find((rule) => rule.token === 'nolock');
    expect(lightNolockRule).toBeDefined();
    expect(lightNolockRule?.foreground).toBe('c9457a');
  });

  it('cria tokens provider baseado em @sequelei/core atribuindo token nolock', () => {
    const provider = createSqlTokensProvider();
    const mockState: Monaco.languages.IState = {
      clone: () => mockState,
      equals: () => true,
    };
    const result = provider.tokenize('select * from dbo.users with (nolock)', mockState);

    expect(result.tokens).toBeDefined();
    const nolockToken = result.tokens.find((t) => t.scopes === 'nolock');
    expect(nolockToken).toBeDefined();
  });
});
