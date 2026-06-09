'use client';

import { useEffect, useState, useTransition } from 'react';
import { Clock, AlertCircle, CheckCircle2, Loader2, XCircle, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { getWorkflowHistory } from '@/app/actions/get-workflow-history';
import {
  WorkflowExecutionStatus,
  WorkflowTriggerType,
  type WorkflowExecution,
} from '@shepai/core/domain/generated/output';

export interface WorkflowExecutionHistoryProps {
  workflowId: string;
  executions?: WorkflowExecution[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  [WorkflowExecutionStatus.Completed]: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  [WorkflowExecutionStatus.Failed]: {
    label: 'Failed',
    icon: XCircle,
    className: 'text-red-600 dark:text-red-400',
  },
  [WorkflowExecutionStatus.Running]: {
    label: 'Running',
    icon: Loader2,
    className: 'text-blue-600 dark:text-blue-400',
  },
  [WorkflowExecutionStatus.Queued]: {
    label: 'Queued',
    icon: Clock,
    className: 'text-amber-600 dark:text-amber-400',
  },
  [WorkflowExecutionStatus.Cancelled]: {
    label: 'Cancelled',
    icon: AlertCircle,
    className: 'text-muted-foreground',
  },
};

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTime(date: Date | string | number | undefined): string {
  if (date == null) return '-';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WorkflowExecutionHistory({
  workflowId,
  executions: initialExecutions,
}: WorkflowExecutionHistoryProps) {
  const [executions, setExecutions] = useState<WorkflowExecution[]>(initialExecutions ?? []);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialExecutions) return;
    startTransition(async () => {
      const result = await getWorkflowHistory(workflowId, 10);
      if (result.executions) {
        setExecutions(result.executions);
      }
    });
  }, [workflowId, initialExecutions]);

  if (isPending && executions.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-center text-xs">No execution history yet</div>
    );
  }

  return (
    <div data-testid="workflow-execution-history" className="space-y-1">
      {executions.map((execution) => {
        const statusConfig =
          STATUS_CONFIG[execution.status] ?? STATUS_CONFIG[WorkflowExecutionStatus.Queued];
        const StatusIcon = statusConfig.icon;
        const isRunning = execution.status === WorkflowExecutionStatus.Running;

        return (
          <div
            key={execution.id}
            data-testid="workflow-execution-row"
            className="flex items-center gap-3 rounded-md border px-3 py-2"
          >
            <StatusIcon
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                statusConfig.className,
                isRunning && 'animate-spin'
              )}
            />
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className={cn('text-xs font-medium', statusConfig.className)}>
                {statusConfig.label}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {execution.triggerType === WorkflowTriggerType.Manual ? 'Manual' : 'Scheduled'}
              </Badge>
              <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                <Timer className="h-2.5 w-2.5" />
                {formatDuration(execution.durationMs)}
              </span>
              {execution.errorMessage ? (
                <span
                  className="min-w-0 truncate text-[10px] text-red-600 dark:text-red-400"
                  title={execution.errorMessage}
                >
                  {execution.errorMessage}
                </span>
              ) : null}
            </div>
            <span className="text-muted-foreground shrink-0 text-[10px]">
              {formatTime(execution.startedAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
