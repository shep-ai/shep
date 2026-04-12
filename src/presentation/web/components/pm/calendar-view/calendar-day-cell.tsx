'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

export interface CalendarDayCellProps {
  date: Date;
  workItems: WorkItem[];
  projectPrefix: string;
  stateMap: Map<string, WorkItemState>;
  isCurrentMonth: boolean;
  isToday: boolean;
  onItemClick?: (workItem: WorkItem) => void;
  onDropItem?: (workItemId: string, newDate: Date) => void;
}

const MAX_VISIBLE_ITEMS = 3;

export function CalendarDayCell({
  date,
  workItems,
  projectPrefix,
  stateMap,
  isCurrentMonth,
  isToday,
  onItemClick,
}: CalendarDayCellProps) {
  const dateKey = formatDateKey(date);
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dateKey}` });

  const visibleItems = workItems.slice(0, MAX_VISIBLE_ITEMS);
  const overflowCount = workItems.length - MAX_VISIBLE_ITEMS;

  return (
    <div
      ref={setNodeRef}
      data-testid={`calendar-day-${dateKey}`}
      className={cn(
        'flex min-h-[100px] flex-col border-r border-b p-1.5',
        !isCurrentMonth && 'bg-muted/30',
        isOver && 'bg-accent/40'
      )}
    >
      <span
        className={cn(
          'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
          isToday && 'bg-primary text-primary-foreground font-semibold',
          !isToday && !isCurrentMonth && 'text-muted-foreground/50',
          !isToday && isCurrentMonth && 'text-foreground'
        )}
      >
        {date.getDate()}
      </span>

      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        {visibleItems.map((item) => (
          <CalendarItemChip
            key={item.id}
            workItem={item}
            projectPrefix={projectPrefix}
            state={stateMap.get(item.stateId)}
            onClick={onItemClick}
          />
        ))}

        {overflowCount > 0 && (
          <span className="text-muted-foreground mt-0.5 text-[10px]">+{overflowCount} more</span>
        )}
      </div>
    </div>
  );
}

interface CalendarItemChipProps {
  workItem: WorkItem;
  projectPrefix: string;
  state?: WorkItemState;
  onClick?: (workItem: WorkItem) => void;
}

function CalendarItemChip({ workItem, projectPrefix, state, onClick }: CalendarItemChipProps) {
  const identifier = `${projectPrefix}-${workItem.sequenceId}`;

  return (
    <button
      type="button"
      data-testid={`calendar-chip-${identifier}`}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px]',
        'hover:bg-accent cursor-pointer transition-colors'
      )}
      onClick={() => onClick?.(workItem)}
    >
      {state ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: state.color }}
        />
      ) : null}
      <span className="text-muted-foreground shrink-0 font-mono">{identifier}</span>
      <span className="truncate">{workItem.title}</span>
    </button>
  );
}

/** Format a Date as YYYY-MM-DD for stable keys */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export { formatDateKey };
