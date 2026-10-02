'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  HarnessSessionStatus,
  HarnessTaskStatus,
  type HarnessSession,
} from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  applyHarnessSession,
  discardHarnessSession,
  promoteHarnessSession,
  stopHarnessSession,
} from '@/app/actions/harness-commands';

export interface HarnessSessionActionsProps {
  session: HarnessSession;
  latestTaskStatus?: HarnessTaskStatus;
  onChanged?: () => void;
}

const RUNNING: ReadonlySet<HarnessTaskStatus> = new Set([
  HarnessTaskStatus.Pending,
  HarnessTaskStatus.Running,
  HarnessTaskStatus.Blocked,
]);

/** Standalone outcomes (spec 119, F4): stop while running; apply, promote or discard after. */
export function HarnessSessionActions({
  session,
  latestTaskStatus,
  onChanged,
}: HarnessSessionActionsProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [branch, setBranch] = useState('');
  const [isPending, startTransition] = useTransition();
  const running = latestTaskStatus !== undefined && RUNNING.has(latestTaskStatus);
  const closed =
    session.status === HarnessSessionStatus.Discarded ||
    session.status === HarnessSessionStatus.Completed;

  function act<T>(
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    done: (data: T) => void
  ) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        done(r.data);
        onChanged?.();
      }
    });
  }

  if (running) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        data-testid="harness-stop"
        onClick={() =>
          act(
            () => stopHarnessSession(session.id),
            () => toast.success(t('harness.actions.stopRequested'))
          )
        }
      >
        {t('harness.actions.stop')}
      </Button>
    );
  }
  if (closed)
    return (
      <p className="text-muted-foreground text-xs">
        {t(`harness.sessionStatus.${session.status}`)}
      </p>
    );

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="harness-session-actions">
      <Input
        className="h-8 w-48 text-xs"
        placeholder={t('harness.actions.branchPlaceholder')}
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
      />
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          act(
            () => applyHarnessSession(session.id, branch.trim() || undefined),
            (r) =>
              toast.success(
                t('harness.actions.applied', { branch: r.branch, count: r.files.length })
              )
          )
        }
      >
        {t('harness.actions.apply')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          act(
            () => promoteHarnessSession(session.id),
            (r) => router.push(`/feature/${r.featureId}`)
          )
        }
      >
        {t('harness.actions.promote')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() =>
          act(
            () => discardHarnessSession(session.id),
            () => toast.success(t('harness.actions.discarded'))
          )
        }
      >
        {t('harness.actions.discard')}
      </Button>
    </div>
  );
}
