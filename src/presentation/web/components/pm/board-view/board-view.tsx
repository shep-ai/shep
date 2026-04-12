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
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { BoardColumn } from './board-column';

type GroupByOption = 'state';

export interface BoardViewProps {
  workItems: WorkItem[];
  states: WorkItemState[];
  projectPrefix: string;
  onWorkItemUpdate?: (workItemId: string, fields: Record<string, unknown>) => void;
  onCardClick?: (workItem: WorkItem) => void;
  groupBy?: GroupByOption;
  className?: string;
}

interface ColumnData {
  id: string;
  title: string;
  color: string;
  items: WorkItem[];
}

export function BoardView({
  workItems: initialWorkItems,
  states,
  projectPrefix,
  onWorkItemUpdate,
  onCardClick,
  groupBy = 'state',
  className,
}: BoardViewProps) {
  const [workItems, setWorkItems] = useState<WorkItem[]>(initialWorkItems);

  const stateMap = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const sortedStates = useMemo(
    () => [...states].sort((a, b) => a.displayOrder - b.displayOrder),
    [states]
  );

  const columns: ColumnData[] = useMemo(() => {
    if (groupBy === 'state') {
      const itemsByState = new Map<string, WorkItem[]>();

      // Initialize all state columns (even empty ones)
      for (const state of sortedStates) {
        itemsByState.set(state.id, []);
      }

      // Distribute work items into columns
      for (const item of workItems) {
        const bucket = itemsByState.get(item.stateId);
        if (bucket) {
          bucket.push(item);
        }
      }

      // Sort items within each column by sortOrder
      for (const bucket of itemsByState.values()) {
        bucket.sort((a, b) => a.sortOrder - b.sortOrder);
      }

      return sortedStates.map((state) => ({
        id: state.id,
        title: state.name,
        color: state.color,
        items: itemsByState.get(state.id) ?? [],
      }));
    }

    return [];
  }, [workItems, sortedStates, groupBy]);

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

      // Determine the target column (state)
      // The over target could be a card or a column droppable
      let targetStateId: string | undefined;

      // Check if we dropped on a column directly
      const isColumnDrop = sortedStates.some((s) => s.id === overId);
      if (isColumnDrop) {
        targetStateId = overId;
      } else {
        // Dropped on a card -- find which column the target card is in
        const targetItem = workItems.find((wi) => wi.id === overId);
        targetStateId = targetItem?.stateId;
      }

      if (!targetStateId) return;

      const draggedItem = workItems.find((wi) => wi.id === activeId);
      if (!draggedItem) return;

      // No change needed if staying in the same state
      if (draggedItem.stateId === targetStateId) return;

      // Optimistic update: move the card to the new state
      setWorkItems((prev) =>
        prev.map((wi) => (wi.id === activeId ? { ...wi, stateId: targetStateId } : wi))
      );

      // Notify parent asynchronously
      onWorkItemUpdate?.(activeId, { stateId: targetStateId });
    },
    [workItems, sortedStates, onWorkItemUpdate]
  );

  return (
    <div data-testid="board-view" className={cn('flex gap-4 overflow-x-auto pb-4', className)}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {columns.map((column) => (
          <BoardColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            items={column.items}
            projectPrefix={projectPrefix}
            stateMap={stateMap}
            onCardClick={onCardClick}
          />
        ))}
      </DndContext>
    </div>
  );
}
