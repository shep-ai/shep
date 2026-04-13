'use client';

import { Badge } from '@/components/ui/badge';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'bg-red-500/10 text-red-500',
  High: 'bg-orange-500/10 text-orange-500',
  Medium: 'bg-yellow-500/10 text-yellow-500',
  Low: 'bg-blue-500/10 text-blue-500',
  None: 'bg-muted text-muted-foreground',
};

export interface WorkItemRowProps {
  workItem: WorkItem;
  state?: WorkItemState;
  projectPrefix: string;
}

export function WorkItemRow({ workItem, state, projectPrefix }: WorkItemRowProps) {
  const identifier = `${projectPrefix}-${workItem.sequenceId}`;

  return (
    <div
      data-testid={`work-item-row-${identifier}`}
      className="hover:bg-accent/50 flex items-center gap-3 px-3 py-2 transition-colors"
    >
      <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{identifier}</span>
      {state ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: state.color }}
          title={state.name}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-xs">{workItem.title}</span>
      {workItem.estimateValue ? (
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {workItem.estimateValue}
        </Badge>
      ) : null}
      {workItem.priority && workItem.priority !== 'None' ? (
        <Badge
          variant="secondary"
          className={`shrink-0 text-[10px] ${PRIORITY_COLORS[workItem.priority] ?? ''}`}
        >
          {workItem.priority}
        </Badge>
      ) : null}
    </div>
  );
}
