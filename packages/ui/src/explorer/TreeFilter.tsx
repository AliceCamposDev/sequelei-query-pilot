import { useEffect, useRef } from 'react';

export interface TreeFilterProps {
  onChange: (value: string) => void;
  value: string;
}

export function TreeFilter({ onChange, value }: TreeFilterProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="tree-filter">
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        aria-label="Filtrar objetos"
        className="tree-filter-input"
        placeholder="Filtrar tabelas, views, colunas..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className="tree-filter-clear"
          aria-label="Limpar filtro"
          onClick={() => onChange('')}
        >
          ×
        </button>
      )}
    </div>
  );
}
