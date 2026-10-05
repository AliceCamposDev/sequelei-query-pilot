import Editor from '@monaco-editor/react';

import { configureMonaco, SQL_THEME_DARK, SQL_THEME_LIGHT } from './monacoSetup';

interface SqlEditorProps {
  onChange: (sql: string) => void;
  theme?: 'dark' | 'light';
  value: string;
}

export function SqlEditor({ onChange, theme = 'dark', value }: SqlEditorProps) {
  const monacoTheme = theme === 'light' ? SQL_THEME_LIGHT : SQL_THEME_DARK;

  return (
    <Editor
      beforeMount={configureMonaco}
      height="100%"
      language="sql"
      onChange={(nextValue) => onChange(nextValue ?? '')}
      options={{
        automaticLayout: true,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        minimap: { enabled: false },
        padding: { top: 16 },
        scrollBeyondLastLine: false,
      }}
      theme={monacoTheme}
      value={value}
    />
  );
}
