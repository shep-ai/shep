'use client';

import { useCallback } from 'react';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { WorkItemRow } from '@/components/features/projects/work-item-row';
import { useBulkSelection } from './bulk-selection-context';

export interface SelectableWorkItemRowProps {
  workItem: WorkItem;
  state?: WorkItemState;
  projectPrefix: string;
}

export function SelectableWorkItemRow({
  workItem,
  state,
  projectPrefix,
}: SelectableWorkItemRowProps) {
  const { isSelected, toggleSelection } = useBulkSelection();
  const selected = isSelected(workItem.id);

  const handleCheckboxChange = useCallback(() => {
    toggleSelection(workItem.id);
  }, [toggleSelection, workItem.id]);

  return (
    <div
      data-testid={`selectable-work-item-row-${projectPrefix}-${workItem.sequenceId}`}
      className={cn('flex items-center', selected && 'bg-accent/60')}
    >
      <div className="flex shrink-0 items-center pl-2">
        <Checkbox
          data-testid={`work-item-checkbox-${workItem.id}`}
          checked={selected}
          onCheckedChange={handleCheckboxChange}
          aria-label={`Select ${projectPrefix}-${workItem.sequenceId}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <WorkItemRow workItem={workItem} state={state} projectPrefix={projectPrefix} />
      </div>
    </div>
  );
}
