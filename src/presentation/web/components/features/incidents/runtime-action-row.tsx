'use client';

/**
 * RuntimeActionRow — one restart, rollback or scale on an incident's workload
 * (spec 129): who proposed it and why, what it printed, whether the workload
 * recovered, and approve or reject while it waits.
 */

import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { RuntimeActionStatus, type RuntimeAction } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import type { RunAction } from '@/hooks/use-run-action';
import { approveRuntimeAction, rejectRuntimeAction } from '@/app/actions/incidents';
import { ActionStatusBadge } from './incident-badges';

export interface RuntimeActionRowProps {
  action: RuntimeAction;
  run: RunAction;
}

export function RuntimeActionRow({ action, run }: RuntimeActionRowProps) {
  const { t } = useTranslation('web');
  const label =
    action.replicas === undefined
      ? t(`incidents.actionKind.${action.kind}`)
      : t('incidents.scaleTo', { replicas: action.replicas });
  let recovery: string | undefined;
  if (action.recovered === true) recovery = t('incidents.recovered');
  else if (action.recovered === false) recovery = t('incidents.notRecovered');

  return (
    <li
      data-testid={`runtime-action-${action.id}`}
      className="bg-card space-y-1 rounded-md border p-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{label}</span>
        <ActionStatusBadge status={action.status} />
        <span className="text-muted-foreground">
          {t(`incidents.proposedBy.${action.proposedBy}`)}
        </span>
        {recovery ? (
          <span className={action.recovered ? 'text-emerald-600' : 'text-destructive'}>
            {recovery}
          </span>
        ) : null}
        {action.status === RuntimeActionStatus.Proposed ? (
          <span className="ms-auto flex gap-1">
            <Button
              size="xs"
              onClick={() => run(() => approveRuntimeAction(action.id))}
              data-testid={`approve-${action.id}`}
            >
              <Check />
              {t('incidents.approve')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => run(() => rejectRuntimeAction(action.id))}
              data-testid={`reject-${action.id}`}
            >
              <X />
              {t('incidents.reject')}
            </Button>
          </span>
        ) : null}
      </div>
      {action.reason ? <p className="text-muted-foreground">{action.reason}</p> : null}
      {action.output ? (
        <pre className="bg-muted overflow-x-auto rounded p-1.5 font-mono text-[11px] whitespace-pre-wrap">
          {action.output}
        </pre>
      ) : null}
    </li>
  );
}
