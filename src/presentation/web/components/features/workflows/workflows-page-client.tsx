'use client';

import { useState, useCallback } from 'react';
import { CalendarClock } from 'lucide-react';
import { WorkflowList } from './workflow-list';
import type { ScheduledWorkflow } from '@shepai/core/domain/generated/output';

export interface WorkflowsPageClientProps {
  workflows: ScheduledWorkflow[];
}

export function WorkflowsPageClient({ workflows: initialWorkflows }: WorkflowsPageClientProps) {
  const [workflows, setWorkflows] = useState<ScheduledWorkflow[]>(initialWorkflows);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, enabled } : w)));
  }, []);

  const enabledCount = workflows.filter((w) => w.enabled).length;
  const scheduledCount = workflows.filter((w) => w.cronExpression).length;

  return (
    <div data-testid="workflows-page-client" className="max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="text-muted-foreground h-4 w-4" />
        <h1 className="text-sm font-bold tracking-tight">Scheduled Workflows</h1>
        <span className="text-muted-foreground text-[10px]">
          {enabledCount} enabled, {scheduledCount} scheduled
        </span>
      </div>

      <WorkflowList workflows={workflows} onToggle={handleToggle} />
    </div>
  );
}
