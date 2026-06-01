'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import type { SdlcTask, SdlcSubTask } from '@shepai/core/domain/generated/output';
import { TaskState } from '@shepai/core/domain/generated/output';
import { SdlcCard } from './sdlc-card';

/**
 * Hex accent colours for the column header dot, mirroring the PM board's
 * colour language — keyed off the enum, no magic strings.
 */
const COLUMN_COLORS: Record<TaskState, string> = {
  [TaskState.Todo]: '#94a3b8', // slate-400
  [TaskState.WIP]: '#f59e0b', // amber-500
  [TaskState.Review]: '#8b5cf6', // violet-500
  [TaskState.Done]: '#22c55e', // emerald-500
};

export interface SdlcColumnTaskEntry {
  task: SdlcTask;
  subTasks: SdlcSubTask[];
  epicName: string;
}

export interface SdlcColumnProps {
  status: TaskState;
  title: string;
  tasks: SdlcColumnTaskEntry[];
  onCardClick?: (task: SdlcTask) => void;
}

export function SdlcColumn({ status, title, tasks, onCardClick }: SdlcColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const taskIds = tasks.map((t) => t.task.id);

  return (
    <div
      data-testid={`sdlc-column-${status}`}
      className="bg-muted/30 flex w-72 shrink-0 flex-col rounded-lg"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: COLUMN_COLORS[status] }}
        />
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-muted-foreground text-[10px]">{tasks.length}</span>
      </div>

      {/* Column body */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2 transition-colors',
            isOver && 'bg-accent/40 rounded-b-lg'
          )}
        >
          {tasks.map(({ task, subTasks, epicName }) => (
            <SdlcCard
              key={task.id}
              task={task}
              subTasks={subTasks}
              epicName={epicName}
              onClick={onCardClick}
            />
          ))}

          {tasks.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground/50 text-[10px]">No tasks</p>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}
