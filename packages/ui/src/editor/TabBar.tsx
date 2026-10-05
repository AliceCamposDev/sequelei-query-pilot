import { useEffect, useRef } from 'react';

import type { QueryTab } from '../store/tabsSlice';

export interface TabBarProps {
  activeTabId: string;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onSelectTab: (id: string) => void;
  tabs: QueryTab[];
}

export function TabBar({ activeTabId, onAddTab, onCloseTab, onSelectTab, tabs }: TabBarProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleClose = (tab: QueryTab, event: React.MouseEvent) => {
    event.stopPropagation();
    if (tab.dirty) {
      const confirmed = window.confirm(
        `A aba "${tab.title}" possui alterações não salvas. Deseja fechar mesmo assim?`,
      );
      if (!confirmed) return;
    }
    onCloseTab(tab.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextIndex = (index + 1) % tabs.length;
      const target = tabs[nextIndex];
      if (target) {
        onSelectTab(target.id);
        tabRefs.current[target.id]?.focus();
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevIndex = (index - 1 + tabs.length) % tabs.length;
      const target = tabs[prevIndex];
      if (target) {
        onSelectTab(target.id);
        tabRefs.current[target.id]?.focus();
      }
    } else if (event.key === 'Home') {
      event.preventDefault();
      const target = tabs[0];
      if (target) {
        onSelectTab(target.id);
        tabRefs.current[target.id]?.focus();
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      const target = tabs[tabs.length - 1];
      if (target) {
        onSelectTab(target.id);
        tabRefs.current[target.id]?.focus();
      }
    }
  };

  // Suporte a atalhos de teclado Ctrl+T / Ctrl+W / Ctrl+Tab
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrMeta = event.ctrlKey || event.metaKey;

      if (isCtrlOrMeta && event.key.toLowerCase() === 't') {
        event.preventDefault();
        onAddTab();
      } else if (isCtrlOrMeta && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        const activeTab = tabs.find((t) => t.id === activeTabId);
        if (activeTab) {
          if (activeTab.dirty) {
            const confirmed = window.confirm(
              `A aba "${activeTab.title}" possui alterações não salvas. Deseja fechar mesmo assim?`,
            );
            if (!confirmed) return;
          }
          onCloseTab(activeTab.id);
        }
      } else if (isCtrlOrMeta && event.key === 'Tab') {
        event.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex !== -1 && tabs.length > 1) {
          const nextIndex = (currentIndex + 1) % tabs.length;
          const target = tabs[nextIndex];
          if (target) onSelectTab(target.id);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTabId, onAddTab, onCloseTab, onSelectTab, tabs]);

  return (
    <div className="editor-tabs" role="tablist" aria-label="Abas de consulta">
      {tabs.map((tab, index) => {
        const isSelected = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span>{tab.title}</span>
            {tab.dirty && <span className="tab-dirty-indicator">*</span>}
            {tabs.length > 1 && (
              <span
                role="button"
                tabIndex={0}
                className="tab-close"
                aria-label={`Fechar ${tab.title}`}
                onClick={(event) => handleClose(tab, event)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                    handleClose(tab, event as unknown as React.MouseEvent);
                  }
                }}
              >
                ×
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        role="button"
        aria-label="Nova aba"
        className="tab-add"
        onClick={onAddTab}
      >
        +
      </button>
    </div>
  );
}
