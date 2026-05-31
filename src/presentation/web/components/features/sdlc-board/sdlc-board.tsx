'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import type { SdlcTask } from '@shepai/core/domain/generated/output';
import { TaskState } from '@shepai/core/domain/generated/output';
import type { SdlcBoardEpic } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';
import { SdlcColumn } from './sdlc-column';
import type { SdlcColumnTaskEntry } from './sdlc-column';

/**
 * Fixed column order for the SDLC board — left to right.
 */
const COLUMN_ORDER: TaskState[] = [TaskState.Todo, TaskState.WIP, TaskState.Review, TaskState.Done];

/**
 * Human-readable column titles — WIP becomes "In Progress" for readability.
 */
const COLUMN_TITLES: Record<TaskState, string> = {
  [TaskState.Todo]: 'Todo',
  [TaskState.WIP]: 'In Progress',
  [TaskState.Review]: 'Review',
  [TaskState.Done]: 'Done',
};

/** A flat task entry carrying its epic label and sub-tasks. */
interface FlatTaskEntry extends SdlcColumnTaskEntry {
  /** Duplicated here so we can look up the task's status during drag. */
  status: TaskState;
}

export interface SdlcBoardProps {
  epics: SdlcBoardEpic[];
  onTaskStatusChange?: (taskId: string, status: TaskState) => void;
  onCardClick?: (task: SdlcTask) => void;
  className?: string;
}

export function SdlcBoard({ epics, onTaskStatusChange, onCardClick, className }: SdlcBoardProps) {
  // Flatten epics into a map of taskId → FlatTaskEntry for drag resolution,
  // and keep a local status override map for optimistic updates.
  const baseEntries = useMemo<FlatTaskEntry[]>(() => {
    const entries: FlatTaskEntry[] = [];
    for (const { feature, tasks } of epics) {
      for (const { task, subTasks } of tasks) {
        entries.push({
          task,
          subTasks,
          epicName: feature.name,
          status: task.status,
        });
      }
    }
    return entries;
  }, [epics]);

  // Optimistic overrides: taskId → TaskState.  Only populated on drag.
  const [statusOverrides, setStatusOverrides] = useState<Map<string, TaskState>>(new Map());

  // Merge overrides into entries so columns always reflect the optimistic state.
  const entries = useMemo<FlatTaskEntry[]>(() => {
    if (statusOverrides.size === 0) return baseEntries;
    return baseEntries.map((e) => {
      const override = statusOverrides.get(e.task.id);
      return override !== undefined ? { ...e, status: override } : e;
    });
  }, [baseEntries, statusOverrides]);

  // Distribute into columns, sorted by sortOrder within each column.
  const columns = useMemo<Record<TaskState, SdlcColumnTaskEntry[]>>(() => {
    const map: Record<TaskState, FlatTaskEntry[]> = {
      [TaskState.Todo]: [],
      [TaskState.WIP]: [],
      [TaskState.Review]: [],
      [TaskState.Done]: [],
    };

    for (const entry of entries) {
      const bucket = map[entry.status];
      if (bucket) {
        bucket.push(entry);
      }
    }

    // Sort within each column by sortOrder ASC
    for (const bucket of Object.values(map)) {
      bucket.sort((a, b) => a.task.sortOrder - b.task.sortOrder);
    }

    return map;
  }, [entries]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      // Determine target status: dropped on a column directly (overId is a TaskState)
      // or dropped on a card (resolve that card's current status).
      let targetStatus: TaskState | undefined;

      const isColumnDrop = COLUMN_ORDER.includes(overId as TaskState);
      if (isColumnDrop) {
        targetStatus = overId as TaskState;
      } else {
        // Dropped on a card — find its current (possibly optimistic) status.
        const targetEntry = entries.find((e) => e.task.id === overId);
        targetStatus = targetEntry?.status;
      }

      if (!targetStatus) return;

      const draggedEntry = entries.find((e) => e.task.id === activeId);
      if (!draggedEntry) return;

      // No-op if the card is already in the target column.
      if (draggedEntry.status === targetStatus) return;

      // Optimistic local update.
      setStatusOverrides((prev) => {
        const next = new Map(prev);
        next.set(activeId, targetStatus!);
        return next;
      });

      // Notify parent; parent will eventually re-render with updated epics
      // causing the override to become redundant (and it will be a no-op).
      onTaskStatusChange?.(activeId, targetStatus);
    },
    [entries, onTaskStatusChange]
  );

  return (
    <div data-testid="sdlc-board" className={cn('flex gap-4 overflow-x-auto pb-4', className)}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {COLUMN_ORDER.map((status) => (
          <SdlcColumn
            key={status}
            status={status}
            title={COLUMN_TITLES[status]}
            tasks={columns[status]}
            onCardClick={onCardClick}
          />
        ))}
      </DndContext>
    </div>
  );
}
