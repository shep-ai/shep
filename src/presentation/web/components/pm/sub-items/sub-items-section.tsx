'use client';

import { useState } from 'react';
import { Plus, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { CreateWorkItemDialog } from '@/components/features/projects/create-work-item-dialog';

const MAX_DEPTH = 3;

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'bg-red-500/10 text-red-500',
  High: 'bg-orange-500/10 text-orange-500',
  Medium: 'bg-yellow-500/10 text-yellow-500',
  Low: 'bg-blue-500/10 text-blue-500',
  None: 'bg-muted text-muted-foreground',
};

export interface SubItemsSectionProps {
  /** The current work item (parent) */
  workItem: WorkItem;
  /** All work items in the project (used to find children) */
  allWorkItems: WorkItem[];
  /** Available workflow states for display */
  states: WorkItemState[];
  /** Project prefix for identifiers (e.g., 'FE') */
  projectPrefix: string;
  /** Project ID for creating new sub-items */
  projectId: string;
  /** Current nesting depth (0-based) */
  currentDepth?: number;
  /** Callback when a sub-item is clicked */
  onSubItemClick?: (workItem: WorkItem) => void;
  className?: string;
}

export function SubItemsSection({
  workItem,
  allWorkItems,
  states,
  projectPrefix,
  projectId,
  currentDepth = 0,
  onSubItemClick,
  className,
}: SubItemsSectionProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [localItems, setLocalItems] = useState<WorkItem[]>([]);

  const stateMap = new Map(states.map((s) => [s.id, s]));

  const childItems = [
    ...allWorkItems.filter((wi) => wi.parentId === workItem.id),
    ...localItems.filter((li) => !allWorkItems.some((wi) => wi.id === li.id)),
  ];

  const atMaxDepth = currentDepth >= MAX_DEPTH - 1;

  const handleCreated = (newItem: WorkItem) => {
    setLocalItems((prev) => [...prev, newItem]);
    setShowCreateDialog(false);
  };

  return (
    <div data-testid="sub-items-section" className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-xs font-medium">Sub-items</span>
          {childItems.length > 0 && (
            <span className="text-muted-foreground text-[10px]">{childItems.length}</span>
          )}
        </div>
        {!atMaxDepth && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => setShowCreateDialog(true)}
            data-testid="add-sub-item-btn"
          >
            <Plus className="mr-0.5 h-3 w-3" />
            Add
          </Button>
        )}
      </div>

      {atMaxDepth ? (
        <div
          className="flex items-center gap-1.5 rounded bg-yellow-500/10 px-2 py-1.5"
          data-testid="max-depth-warning"
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-500" />
          <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
            Maximum nesting depth reached ({MAX_DEPTH} levels). Cannot add sub-items here.
          </span>
        </div>
      ) : null}

      {childItems.length === 0 && !atMaxDepth && (
        <p
          className="text-muted-foreground py-2 text-center text-[10px]"
          data-testid="sub-items-empty"
        >
          No sub-items yet.
        </p>
      )}

      {childItems.length > 0 && (
        <div className="divide-y rounded-lg border" data-testid="sub-items-list">
          {childItems.map((child) => {
            const state = stateMap.get(child.stateId);
            const identifier = `${projectPrefix}-${child.sequenceId}`;
            return (
              <div
                key={child.id}
                data-testid={`sub-item-${identifier}`}
                className="hover:bg-accent/50 flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors"
                onClick={() => onSubItemClick?.(child)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSubItemClick?.(child);
                  }
                }}
              >
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                  {identifier}
                </span>
                {state ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: state.color }}
                    title={state.name}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-xs">{child.title}</span>
                {child.priority && child.priority !== 'None' ? (
                  <Badge
                    variant="secondary"
                    className={`shrink-0 text-[10px] ${PRIORITY_COLORS[child.priority] ?? ''}`}
                  >
                    {child.priority}
                  </Badge>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {!atMaxDepth && (
        <CreateWorkItemDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          projectId={projectId}
          states={states}
          onCreated={handleCreated}
          parentId={workItem.id}
        />
      )}
    </div>
  );
}
