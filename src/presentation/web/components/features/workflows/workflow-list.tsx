'use client';

import { CalendarClock } from 'lucide-react';
import { WorkflowListItem } from './workflow-list-item';
import type { ScheduledWorkflow } from '@shepai/core/domain/generated/output';

export interface WorkflowListProps {
  workflows: ScheduledWorkflow[];
  onToggle?: (id: string, enabled: boolean) => void;
  onTrigger?: (id: string) => void;
}

export function WorkflowList({ workflows, onToggle, onTrigger }: WorkflowListProps) {
  if (workflows.length === 0) {
    return (
      <div
        data-testid="workflow-list-empty"
        className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
      >
        <CalendarClock className="mb-2 h-6 w-6 opacity-20" />
        <p className="text-xs">No workflows found.</p>
        <p className="text-muted-foreground/60 mt-1 text-[10px]">
          Create one with <code className="bg-muted rounded px-1">shep workflow create</code>
        </p>
      </div>
    );
  }

  return (
    <div data-testid="workflow-list" className="space-y-2">
      {workflows.map((workflow) => (
        <WorkflowListItem
          key={workflow.id}
          workflow={workflow}
          onToggle={onToggle}
          onTrigger={onTrigger}
        />
      ))}
    </div>
  );
}
