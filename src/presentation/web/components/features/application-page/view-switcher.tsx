'use client';

import { cn } from '@/lib/utils';

export const VIEW_TABS = ['ide', 'terminal', 'web'] as const;
export type AppView = (typeof VIEW_TABS)[number];

export const VIEW_LABELS: Record<AppView, string> = {
  ide: 'IDE',
  terminal: 'Terminal',
  web: 'Web',
};

export interface ViewSwitcherProps {
  active: AppView;
  onChange: (view: AppView) => void;
  disabledTabs?: AppView[];
}

export function ViewSwitcher({ active, onChange, disabledTabs = [] }: ViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Right pane view"
      className="bg-muted/60 flex items-center rounded-md p-0.5"
    >
      {VIEW_TABS.map((v) => {
        const selected = v === active;
        const disabled = disabledTabs.includes(v);
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              'h-6 rounded-sm px-2.5 text-[11px] font-medium transition-colors',
              disabled ? 'text-muted-foreground/40 cursor-not-allowed' : 'cursor-pointer',
              !disabled && selected
                ? 'bg-background text-foreground shadow-sm'
                : !disabled && 'text-muted-foreground hover:text-foreground'
            )}
          >
            {VIEW_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}
