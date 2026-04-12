'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { BoardCard } from './board-card';

export interface BoardColumnProps {
  id: string;
  title: string;
  color: string;
  items: WorkItem[];
  projectPrefix: string;
  stateMap: Map<string, WorkItemState>;
  onCardClick?: (workItem: WorkItem) => void;
}

export function BoardColumn({
  id,
  title,
  color,
  items,
  projectPrefix,
  stateMap,
  onCardClick,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const itemIds = items.map((item) => item.id);

  return (
    <div
      data-testid={`board-column-${id}`}
      className="bg-muted/30 flex w-72 shrink-0 flex-col rounded-lg"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-muted-foreground text-[10px]">{items.length}</span>
      </div>

      {/* Column body */}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2 transition-colors',
            isOver && 'bg-accent/40 rounded-b-lg'
          )}
        >
          {items.map((item) => (
            <BoardCard
              key={item.id}
              workItem={item}
              projectPrefix={projectPrefix}
              state={stateMap.get(item.stateId)}
              onClick={onCardClick}
            />
          ))}

          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground/50 text-[10px]">No items</p>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}
