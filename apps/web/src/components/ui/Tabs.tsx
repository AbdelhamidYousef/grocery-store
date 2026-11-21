import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  /** Rendered only while the tab is selected. */
  panel: ReactNode;
}

interface TabsProps {
  /** Names the tab list for screen readers ("Product information"). */
  label: string;
  tabs: readonly TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
  /** Extra classes for the panel (the list is shared by every use). */
  panelClassName?: string;
}

// The WAI-ARIA tabs pattern, by hand because the platform has no native one:
//  - the list has role=tablist, each button role=tab with aria-selected and aria-controls;
//  - only the selected tab is in the Tab order (roving tabindex); Left/Right move and select
//    (automatic activation), Home/End jump to the ends, and the selection wraps around;
//  - the panel is itself focusable (tabindex=0) so a keyboard user can scroll its content.
// The list scrolls sideways inside its own box on a narrow screen instead of widening the page.
export function Tabs({ label, tabs, selectedId, onSelect, className, panelClassName }: TabsProps) {
  const prefix = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === selectedId),
  );
  const selected = tabs[selectedIndex];
  const tabId = (id: string) => `${prefix}-tab-${id}`;
  const panelId = (id: string) => `${prefix}-panel-${id}`;

  const move = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (!target) return;
    onSelect(target.id);
    refs.current.get(target.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowRight':
        move(selectedIndex + 1);
        break;
      case 'ArrowLeft':
        move(selectedIndex - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(tabs.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  if (!selected) return null;
  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <div
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="flex min-w-max gap-1 border-b-2 border-line"
        >
          {tabs.map((tab) => {
            const isSelected = tab.id === selected.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  if (el) refs.current.set(tab.id, el);
                  else refs.current.delete(tab.id);
                }}
                type="button"
                role="tab"
                id={tabId(tab.id)}
                aria-selected={isSelected}
                aria-controls={panelId(tab.id)}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                className={cn(
                  '-mb-0.5 min-h-11 whitespace-nowrap border-b-4 px-4 font-display font-semibold hover:bg-dept-soft',
                  isSelected
                    ? 'border-primary text-primary-strong'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="tabpanel"
        id={panelId(selected.id)}
        aria-labelledby={tabId(selected.id)}
        tabIndex={0}
        className={cn('pt-4 focus-visible:rounded-control', panelClassName)}
      >
        {selected.panel}
      </div>
    </div>
  );
}
