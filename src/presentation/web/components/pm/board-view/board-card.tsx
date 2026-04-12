'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'bg-red-500/10 text-red-500',
  High: 'bg-orange-500/10 text-orange-500',
  Medium: 'bg-yellow-500/10 text-yellow-500',
  Low: 'bg-blue-500/10 text-blue-500',
  None: 'bg-muted text-muted-foreground',
};

export interface BoardCardProps {
  workItem: WorkItem;
  projectPrefix: string;
  state?: WorkItemState;
  onClick?: (workItem: WorkItem) => void;
}

export function BoardCard({ workItem, projectPrefix, state, onClick }: BoardCardProps) {
  const identifier = `${projectPrefix}-${workItem.sequenceId}`;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workItem.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formattedDueDate = workItem.dueDate
    ? new Date(workItem.dueDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`board-card-${identifier}`}
      className={cn(
        'bg-card cursor-grab rounded-md border p-3 shadow-sm transition-shadow hover:shadow-md',
        isDragging && 'z-50 opacity-50 shadow-lg'
      )}
      onClick={() => onClick?.(workItem)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(workItem);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-mono text-[10px]">{identifier}</span>
        {state ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: state.color }}
            title={state.name}
          />
        ) : null}
      </div>

      <p className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{workItem.title}</p>

      <div className="mt-2 flex items-center gap-2">
        {workItem.priority && workItem.priority !== 'None' ? (
          <Badge
            variant="secondary"
            className={cn('shrink-0 text-[10px]', PRIORITY_COLORS[workItem.priority])}
          >
            {workItem.priority}
          </Badge>
        ) : null}

        {formattedDueDate ? (
          <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
            <Calendar className="h-3 w-3" />
            {formattedDueDate}
          </span>
        ) : null}
      </div>
    </div>
  );
}
