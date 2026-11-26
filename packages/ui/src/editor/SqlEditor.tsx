import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

import { configureMonaco, SQL_THEME_DARK, SQL_THEME_LIGHT } from './monacoSetup';

interface SqlEditorProps {
  onChange: (sql: string) => void;
  onSelectionChange?: (selectedSql: string) => void;
  theme?: 'dark' | 'light';
  value: string;
}

export function SqlEditor({ onChange, onSelectionChange, theme = 'dark', value }: SqlEditorProps) {
  const monacoTheme = theme === 'light' ? SQL_THEME_LIGHT : SQL_THEME_DARK;
  const selectionCallbackRef = useRef(onSelectionChange);

  useEffect(() => {
    selectionCallbackRef.current = onSelectionChange;
  }, [onSelectionChange]);

  return (
    <Editor
      beforeMount={configureMonaco}
      height="100%"
      language="sql"
      onChange={(nextValue) => onChange(nextValue ?? '')}
      onMount={(editor) => {
        const syncSelection = () => {
          const callback = selectionCallbackRef.current;
          if (!callback) return;
          const model = editor.getModel();
          const selection = editor.getSelection();
          if (!model || !selection || selection.isEmpty()) {
            callback('');
            return;
          }
          callback(model.getValueInRange(selection));
        };

        editor.onDidChangeCursorSelection(syncSelection);
        editor.onDidChangeModelContent(syncSelection);
      }}
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
