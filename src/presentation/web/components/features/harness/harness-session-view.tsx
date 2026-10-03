'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessSessionDetail } from '@shepai/core/application/use-cases/harness/get-harness-session.use-case';
import { cn } from '@/lib/utils';
import { HarnessUsageSummaryView } from './harness-usage-summary';
import { HarnessTaskTurns } from './harness-task-turns';
import { HarnessPermissionCard } from './harness-permission-card';

export interface HarnessSessionViewProps {
  detail: HarnessSessionDetail;
  onChanged?: () => void;
}

/**
 * A harness session (spec 119, F3/F6): pending approvals first, then usage,
 * a task (phase) selector and the selected task's turns and context plans.
 * Used by the /harness session page and the feature drawer's Context tab.
 */
export function HarnessSessionView({ detail, onChanged }: HarnessSessionViewProps) {
  const { t } = useTranslation('web');
  const [taskId, setTaskId] = useState<string | undefined>(detail.tasks.at(-1)?.task.id);
  const selected = detail.tasks.find((x) => x.task.id === taskId) ?? detail.tasks.at(-1);

  return (
    <div className="space-y-4" data-testid="harness-session-view">
      {detail.pendingPermissions.length > 0 ? (
        <div className="space-y-2">
          {detail.pendingPermissions.map((item) => (
            <HarnessPermissionCard key={item.decision.id} item={item} onResolved={onChanged} />
          ))}
        </div>
      ) : null}
      <HarnessUsageSummaryView usage={selected?.usage ?? detail.usage} />
      {detail.tasks.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {detail.tasks.map((x, i) => (
            <button
              key={x.task.id}
              type="button"
              onClick={() => setTaskId(x.task.id)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                x.task.id === selected?.task.id && 'border-primary bg-primary/10'
              )}
            >
              {x.task.phase ?? t('harness.taskN', { n: i + 1 })} · {x.task.status}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <>
          <div className="text-xs">
            <p className="font-medium">{selected.task.goal}</p>
            {selected.task.result ? (
              <p className="text-muted-foreground mt-1">
                {selected.task.result.status} — {selected.task.result.summary}
              </p>
            ) : null}
          </div>
          <HarnessTaskTurns key={selected.task.id} task={selected} />
        </>
      ) : (
        <p className="text-muted-foreground text-xs">{t('harness.noTasks')}</p>
      )}
    </div>
  );
}
