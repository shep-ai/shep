'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SdlcTask, SdlcSubTask } from '@shepai/core/domain/generated/output';
import { TaskState } from '@shepai/core/domain/generated/output';

/**
 * Tailwind color classes for each TaskState — keyed off the enum, no magic strings.
 */
const STATUS_COLORS: Record<TaskState, string> = {
  [TaskState.Todo]: 'bg-slate-500/10 text-slate-500',
  [TaskState.WIP]: 'bg-amber-500/10 text-amber-600',
  [TaskState.Review]: 'bg-violet-500/10 text-violet-600',
  [TaskState.Done]: 'bg-emerald-500/10 text-emerald-600',
};

/**
 * Dot color for the status indicator in the card header.
 */
const STATUS_DOT_COLORS: Record<TaskState, string> = {
  [TaskState.Todo]: 'bg-slate-400',
  [TaskState.WIP]: 'bg-amber-500',
  [TaskState.Review]: 'bg-violet-500',
  [TaskState.Done]: 'bg-emerald-500',
};

export interface SdlcCardProps {
  task: SdlcTask;
  subTasks: SdlcSubTask[];
  epicName: string;
  onClick?: (task: SdlcTask) => void;
}

export function SdlcCard({ task, subTasks, epicName, onClick }: SdlcCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const doneCount = subTasks.filter((st) => st.status === TaskState.Done).length;
  const totalCount = subTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`sdlc-card-${task.id}`}
      className={cn(
        'bg-card cursor-grab rounded-md border p-3 shadow-sm transition-shadow hover:shadow-md',
        isDragging && 'z-50 opacity-50 shadow-lg'
      )}
      onClick={() => onClick?.(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(task);
        }
      }}
    >
      {/* Epic badge + status dot */}
      <div className="flex items-center gap-2">
        <Badge
          variant="secondary"
          className="max-w-[120px] truncate px-1.5 py-0 text-[10px] font-medium"
          title={epicName}
        >
          {epicName}
        </Badge>
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_COLORS[task.status])}
          title={task.status}
        />
      </div>

      {/* Task title */}
      <p className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{task.title}</p>

      {/* Sub-task progress */}
      {totalCount > 0 ? (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[10px]">
              {doneCount}/{totalCount} done
            </span>
            <span className="text-muted-foreground text-[10px]">{progressPercent}%</span>
          </div>
          <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progressPercent === 100 ? 'bg-emerald-500' : 'bg-primary'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Footer: status badge + dependencies */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          className={cn('shrink-0 px-1.5 py-0 text-[10px]', STATUS_COLORS[task.status])}
        >
          {task.status}
        </Badge>

        {task.dependsOnKeys && task.dependsOnKeys.length > 0 ? (
          <Badge
            variant="secondary"
            className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
            title={`Depends on: ${task.dependsOnKeys.join(', ')}`}
          >
            ⛓ {task.dependsOnKeys.length} dep{task.dependsOnKeys.length > 1 ? 's' : ''}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
