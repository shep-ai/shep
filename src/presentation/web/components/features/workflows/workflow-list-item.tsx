'use client';

import { useState, useTransition } from 'react';
import { Play, ChevronDown, ChevronRight, Clock, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toggleWorkflow } from '@/app/actions/toggle-workflow';
import { triggerWorkflow } from '@/app/actions/trigger-workflow';
import { WorkflowExecutionHistory } from './workflow-execution-history';
import type { ScheduledWorkflow } from '@shepai/core/domain/generated/output';

export interface WorkflowListItemProps {
  workflow: ScheduledWorkflow;
  onToggle?: (id: string, enabled: boolean) => void;
  onTrigger?: (id: string) => void;
}

function formatRelativeTime(date: Date | string | number | undefined): string {
  if (date == null) return 'Never';
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0) {
    // Future date
    const absDiff = Math.abs(diffMs);
    if (absDiff < 60_000) return 'in <1m';
    if (absDiff < 3_600_000) return `in ${Math.floor(absDiff / 60_000)}m`;
    if (absDiff < 86_400_000) return `in ${Math.floor(absDiff / 3_600_000)}h`;
    return `in ${Math.floor(absDiff / 86_400_000)}d`;
  }

  if (diffMs < 60_000) return '<1m ago';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

export function WorkflowListItem({ workflow, onToggle, onTrigger }: WorkflowListItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(workflow.enabled);
  const [isToggling, startToggleTransition] = useTransition();
  const [isTriggering, startTriggerTransition] = useTransition();

  function handleToggle(value: boolean) {
    setEnabled(value);
    startToggleTransition(async () => {
      const result = await toggleWorkflow(workflow.id, value);
      if (!result.success) {
        setEnabled(!value);
        toast.error(result.error ?? 'Failed to toggle workflow');
      }
      onToggle?.(workflow.id, value);
    });
  }

  function handleTrigger(e: React.MouseEvent) {
    e.stopPropagation();
    startTriggerTransition(async () => {
      const result = await triggerWorkflow(workflow.id);
      if (result.success) {
        toast.success(`Workflow "${workflow.name}" triggered`);
      } else {
        toast.error(result.error ?? 'Failed to trigger workflow');
      }
      onTrigger?.(workflow.id);
    });
  }

  return (
    <div data-testid="workflow-list-item" className="rounded-lg border">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span data-testid="workflow-name" className="truncate text-sm font-medium">
            {workflow.name}
          </span>
          {workflow.cronExpression ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              <Calendar className="mr-1 h-2.5 w-2.5" />
              {workflow.cronExpression}
            </Badge>
          ) : null}
          {workflow.description ? (
            <span className="text-muted-foreground hidden truncate text-xs lg:inline">
              {workflow.description}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-muted-foreground hidden items-center gap-1 text-[10px] sm:flex">
            <Clock className="h-2.5 w-2.5" />
            {formatRelativeTime(workflow.lastRunAt)}
          </span>

          <Switch
            data-testid="workflow-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isToggling}
            onClick={(e) => e.stopPropagation()}
            className={cn('cursor-pointer', isToggling && 'opacity-50')}
          />

          <Button
            size="sm"
            variant="outline"
            onClick={handleTrigger}
            disabled={isTriggering}
            data-testid="workflow-trigger-button"
            aria-label={`Run ${workflow.name}`}
            className="h-7 cursor-pointer px-2.5 text-xs"
          >
            <Play className="mr-1 h-3 w-3" />
            Run
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t px-4 py-3">
          <WorkflowExecutionHistory workflowId={workflow.id} />
        </div>
      ) : null}
    </div>
  );
}
