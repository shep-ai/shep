'use client';

import { useState, useMemo, useCallback } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { CalendarDayCell, formatDateKey } from './calendar-day-cell';

export interface CalendarViewProps {
  workItems: WorkItem[];
  states: WorkItemState[];
  projectPrefix: string;
  onWorkItemUpdate: (workItemId: string, fields: Record<string, unknown>) => void;
  onItemClick?: (workItem: WorkItem) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function CalendarView({
  workItems,
  states,
  projectPrefix,
  onWorkItemUpdate,
  onItemClick,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, Date>>(new Map());

  const stateMap = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const calendarDays = useMemo(() => buildCalendarDays(currentDate), [currentDate]);

  const today = useMemo(() => {
    const now = new Date();
    return formatDateKey(now);
  }, []);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const itemsByDate = useMemo(() => {
    const map = new Map<string, WorkItem[]>();

    for (const item of workItems) {
      const dateValue = resolveItemDate(item, optimisticUpdates);
      if (!dateValue) continue;

      const key = formatDateKey(new Date(dateValue));
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }

    return map;
  }, [workItems, optimisticUpdates]);

  const handlePreviousMonth = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const droppableId = String(over.id);
      if (!droppableId.startsWith('day-')) return;

      const dateStr = droppableId.slice(4); // Remove 'day-' prefix
      const [year, month, day] = dateStr.split('-').map(Number);
      const newDate = new Date(year, month - 1, day);

      const workItemId = String(active.id);
      const item = workItems.find((wi) => wi.id === workItemId);
      if (!item) return;

      // Optimistic update
      setOptimisticUpdates((prev) => {
        const next = new Map(prev);
        next.set(workItemId, newDate);
        return next;
      });

      // Determine which date field to update
      const fieldToUpdate = item.startDate ? 'startDate' : 'dueDate';
      onWorkItemUpdate(workItemId, { [fieldToUpdate]: newDate.toISOString() });
    },
    [workItems, onWorkItemUpdate]
  );

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(currentDate);

  return (
    <div data-testid="calendar-view" className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handlePreviousMonth}
            data-testid="calendar-prev-month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handleNextMonth}
            data-testid="calendar-next-month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <h2 className="text-sm font-semibold" data-testid="calendar-month-label">
            {monthLabel}
          </h2>
        </div>
        <Button variant="ghost" size="xs" onClick={handleToday} data-testid="calendar-today-btn">
          Today
        </Button>
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="overflow-hidden rounded-lg border">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b">
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="bg-muted/50 px-2 py-1.5 text-center text-[10px] font-medium tracking-wider uppercase"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const dateKey = formatDateKey(day);
              const isCurrentMonthDay =
                day.getMonth() === currentMonth && day.getFullYear() === currentYear;

              return (
                <CalendarDayCell
                  key={dateKey}
                  date={day}
                  workItems={itemsByDate.get(dateKey) ?? []}
                  projectPrefix={projectPrefix}
                  stateMap={stateMap}
                  isCurrentMonth={isCurrentMonthDay}
                  isToday={dateKey === today}
                  onItemClick={onItemClick}
                />
              );
            })}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

/** Resolve the display date for a work item, checking optimistic updates first */
function resolveItemDate(
  item: WorkItem,
  optimisticUpdates: Map<string, Date>
): Date | string | undefined {
  const optimistic = optimisticUpdates.get(item.id);
  if (optimistic) return optimistic;
  return item.startDate ?? item.dueDate;
}

/** Build the full grid of days for a monthly calendar (always 42 cells: 6 rows x 7 cols) */
function buildCalendarDays(referenceDate: Date): Date[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const startOffset = firstDayOfMonth.getDay(); // 0 = Sunday

  const days: Date[] = [];
  const gridStart = new Date(year, month, 1 - startOffset);

  const TOTAL_CELLS = 42; // 6 rows x 7 columns
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  return days;
}
