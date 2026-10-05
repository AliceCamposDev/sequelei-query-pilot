import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  action: () => void;
  disabled?: boolean;
  id: string;
  label: string;
}

export interface ContextMenuProps {
  isOpen: boolean;
  items: ContextMenuItem[];
  onClose: () => void;
  position: { x: number; y: number };
  title?: string | undefined;
}

export function ContextMenu({ isOpen, items, onClose, position, title }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isOpen) return;

    // Foca o primeiro item ao abrir
    itemRefs.current[0]?.focus();

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || items.length === 0) return null;

  const handleItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (index + 1) % items.length;
      itemRefs.current[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = (index - 1 + items.length) % items.length;
      itemRefs.current[prevIndex]?.focus();
    }
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={title ?? 'Menu de contexto'}
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          role="menuitem"
          className="context-menu-item"
          disabled={item.disabled}
          onClick={() => {
            item.action();
            onClose();
          }}
          onKeyDown={(event) => handleItemKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
