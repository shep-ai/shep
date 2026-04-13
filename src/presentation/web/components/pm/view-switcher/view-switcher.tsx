'use client';

import { LayoutList, Kanban, Table2, CalendarDays, BarChart3, GanttChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ViewMode = 'list' | 'board' | 'table' | 'calendar' | 'timeline' | 'analytics';

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: typeof LayoutList }[] = [
  { mode: 'list', label: 'List', icon: LayoutList },
  { mode: 'board', label: 'Board', icon: Kanban },
  { mode: 'table', label: 'Table', icon: Table2 },
  { mode: 'calendar', label: 'Calendar', icon: CalendarDays },
  { mode: 'timeline', label: 'Timeline', icon: GanttChart },
  { mode: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export interface ViewSwitcherProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export function ViewSwitcher({ activeView, onViewChange, className }: ViewSwitcherProps) {
  return (
    <div
      data-testid="view-switcher"
      className={cn('inline-flex items-center rounded-md border p-0.5', className)}
    >
      {VIEW_OPTIONS.map(({ mode, label, icon: Icon }) => (
        <Button
          key={mode}
          variant={activeView === mode ? 'secondary' : 'ghost'}
          size="sm"
          className={cn('h-6 gap-1 px-2 text-[10px]', activeView === mode && 'font-medium')}
          onClick={() => onViewChange(mode)}
          data-testid={`view-switch-${mode}`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </Button>
      ))}
    </div>
  );
}
