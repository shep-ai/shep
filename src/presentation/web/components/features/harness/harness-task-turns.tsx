'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextPlan } from '@shepai/core/domain/generated/output';
import type { HarnessTaskDetail } from '@shepai/core/application/use-cases/harness/get-harness-session.use-case';
import { getHarnessContextPlan } from '@/app/actions/harness-queries';
import { cn } from '@/lib/utils';
import { HarnessPlanTable } from './harness-plan-table';
import { HarnessChunkViewer } from './harness-chunk-viewer';
import { HarnessWhyDrawer, type HarnessWhyTarget } from './harness-why-drawer';
import { formatTokens } from './harness-format';

export interface HarnessTaskTurnsProps {
  task: HarnessTaskDetail;
}

/** One task's turns; selecting a turn shows that call's context plan. */
export function HarnessTaskTurns({ task }: HarnessTaskTurnsProps) {
  const { t } = useTranslation('web');
  const lastPlanId = task.plans.at(-1)?.id ?? null;
  const [planId, setPlanId] = useState<string | null>(lastPlanId);
  const [plan, setPlan] = useState<ContextPlan | null>(null);
  const [viewing, setViewing] = useState<{ chunkId: string; label: string } | null>(null);
  const [why, setWhy] = useState<HarnessWhyTarget | null>(null);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    void getHarnessContextPlan(planId).then((r) => {
      if (!cancelled && r.ok) setPlan(r.data.plan);
    });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const toolsByTurn = new Map<number, typeof task.toolCalls>();
  for (const c of task.toolCalls) toolsByTurn.set(c.turn, [...(toolsByTurn.get(c.turn) ?? []), c]);

  return (
    <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]" data-testid="harness-task-turns">
      <ol className="space-y-1">
        {task.plans.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setPlanId(p.id)}
              className={cn(
                'w-full rounded border px-2 py-1 text-left text-xs',
                p.id === planId && 'border-primary bg-primary/5'
              )}
            >
              <span className="font-medium">{t('harness.turn', { n: p.turn })}</span>{' '}
              <span className="text-muted-foreground">
                {formatTokens(p.estimatedTokens)}/{formatTokens(p.tokenBudget)}
              </span>
              {(toolsByTurn.get(p.turn) ?? []).map((c) => (
                <span key={c.id} className="text-muted-foreground block truncate">
                  • {c.capabilityId} · {c.status}
                </span>
              ))}
            </button>
          </li>
        ))}
      </ol>
      <div className="min-w-0">
        {plan ? (
          <HarnessPlanTable
            plan={plan}
            onView={(chunkId, label) => setViewing({ chunkId, label })}
            onWhy={(chunkId) => setWhy({ planId: plan.id, chunkId })}
          />
        ) : (
          <p className="text-muted-foreground text-xs">{t('harness.plan.none')}</p>
        )}
      </div>
      <HarnessChunkViewer
        chunkId={viewing?.chunkId ?? null}
        label={viewing?.label}
        onClose={() => setViewing(null)}
      />
      <HarnessWhyDrawer target={why} onClose={() => setWhy(null)} />
    </div>
  );
}
