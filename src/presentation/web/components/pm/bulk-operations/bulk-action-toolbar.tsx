'use client';

import { useState, useCallback } from 'react';
import { X, ChevronDown, Trash2, AlertCircle } from 'lucide-react';
import { Priority } from '@shepai/core/domain/generated/output';
import type { WorkItemState } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useBulkSelection } from './bulk-selection-context';

const PRIORITY_VALUES = [
  Priority.Urgent,
  Priority.High,
  Priority.Medium,
  Priority.Low,
  Priority.None,
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'text-red-500',
  High: 'text-orange-500',
  Medium: 'text-yellow-500',
  Low: 'text-blue-500',
  None: 'text-muted-foreground',
};

export interface BulkActionToolbarProps {
  /** Available workflow states for the change state action */
  states: WorkItemState[];
  /** Callback to execute a bulk operation */
  onBulkAction: (
    workItemIds: string[],
    operation:
      | { type: 'changeState'; stateId: string }
      | { type: 'changePriority'; priority: string }
      | { type: 'delete' }
  ) => Promise<{
    ok: boolean;
    succeeded: string[];
    failed: { id: string; error: string }[];
    error?: string;
  }>;
}

type FeedbackState =
  | { type: 'idle' }
  | { type: 'loading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

export function BulkActionToolbar({ states, onBulkAction }: BulkActionToolbarProps) {
  const { selectedIds, clearSelection } = useBulkSelection();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>({ type: 'idle' });

  const selectedCount = selectedIds.size;

  const handleAction = useCallback(
    async (
      operation:
        | { type: 'changeState'; stateId: string }
        | { type: 'changePriority'; priority: string }
        | { type: 'delete' }
    ) => {
      const ids = Array.from(selectedIds);
      const actionLabel =
        operation.type === 'changeState'
          ? 'Changing state'
          : operation.type === 'changePriority'
            ? 'Changing priority'
            : 'Deleting';

      setFeedback({ type: 'loading', message: `${actionLabel}...` });

      const result = await onBulkAction(ids, operation);

      if (result.ok) {
        const count = result.succeeded.length;
        setFeedback({
          type: 'success',
          message: `Updated ${count} item${count !== 1 ? 's' : ''} successfully`,
        });
        clearSelection();
      } else if (result.error) {
        setFeedback({ type: 'error', message: result.error });
      } else {
        const failCount = result.failed.length;
        setFeedback({
          type: 'error',
          message: `${failCount} item${failCount !== 1 ? 's' : ''} failed to update`,
        });
      }

      setTimeout(() => setFeedback({ type: 'idle' }), 3000);
    },
    [selectedIds, onBulkAction, clearSelection]
  );

  const handleDeleteConfirm = useCallback(() => {
    setDeleteDialogOpen(false);
    void handleAction({ type: 'delete' });
  }, [handleAction]);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <div
        data-testid="bulk-action-toolbar"
        className={cn(
          'bg-background fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2',
          'rounded-lg border px-4 py-2 shadow-lg'
        )}
      >
        {/* Selection count */}
        <span data-testid="bulk-selection-count" className="text-sm font-medium">
          {selectedCount} selected
        </span>

        {/* Feedback message */}
        {feedback.type !== 'idle' ? (
          <span
            data-testid="bulk-action-feedback"
            className={cn(
              'text-xs',
              feedback.type === 'loading' && 'text-muted-foreground',
              feedback.type === 'success' && 'text-green-600',
              feedback.type === 'error' && 'text-destructive'
            )}
          >
            {feedback.type === 'error' ? <AlertCircle className="mr-1 inline size-3" /> : null}
            {feedback.message}
          </span>
        ) : null}

        {/* Change State dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="bulk-change-state-trigger"
              disabled={feedback.type === 'loading'}
            >
              Change State
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuLabel>Set state to</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {states.map((state) => (
              <DropdownMenuItem
                key={state.id}
                data-testid={`bulk-state-option-${state.id}`}
                onClick={() => void handleAction({ type: 'changeState', stateId: state.id })}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: state.color }}
                />
                {state.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Change Priority dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="bulk-change-priority-trigger"
              disabled={feedback.type === 'loading'}
            >
              Change Priority
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuLabel>Set priority to</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRIORITY_VALUES.map((priority) => (
              <DropdownMenuItem
                key={priority}
                data-testid={`bulk-priority-option-${priority}`}
                onClick={() => void handleAction({ type: 'changePriority', priority })}
              >
                <span className={cn('text-sm', PRIORITY_COLORS[priority])}>{priority}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete button */}
        <Button
          variant="destructive"
          size="sm"
          data-testid="bulk-delete-trigger"
          disabled={feedback.type === 'loading'}
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="size-3" />
          Delete
        </Button>

        {/* Clear selection */}
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="bulk-clear-selection"
          onClick={clearSelection}
          aria-label="Clear selection"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} work item{selectedCount !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the selected work items. This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="bulk-delete-confirm"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
