import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SqlEditor } from './SqlEditor';

vi.mock('@monaco-editor/react', () => ({
  default: ({
    onChange,
    theme,
    value,
  }: {
    onChange: (value: string) => void;
    theme: string;
    value: string;
  }) => (
    <div data-testid="monaco-wrapper" data-theme={theme}>
      <textarea
        aria-label="Monaco SQL editor"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  ),
}));

describe('SqlEditor', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza Monaco e propaga alterações SQL', () => {
    const onChange = vi.fn();

    render(<SqlEditor onChange={onChange} value="select 1" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Monaco SQL editor' }), {
      target: { value: 'select 2' },
    });

    expect(onChange).toHaveBeenCalledWith('select 2');
  });

  it('aplica tema dark por padrão e alterna para light quando especificado', () => {
    const { rerender } = render(<SqlEditor onChange={vi.fn()} value="select 1" />);
    expect(screen.getByTestId('monaco-wrapper').getAttribute('data-theme')).toBe('sequelei-dark');

    rerender(<SqlEditor onChange={vi.fn()} theme="light" value="select 1" />);
    expect(screen.getByTestId('monaco-wrapper').getAttribute('data-theme')).toBe('sequelei-light');
  });
});
