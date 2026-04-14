'use client';

import type { ApplicationStatus } from '@shepai/core/domain/generated/output';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

import { cn } from '@/lib/utils';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';
import { deriveAppLiveStatus } from '@/lib/derive-app-status';

export interface StatusPillProps {
  applicationId: string;
  persistedStatus: ApplicationStatus;
  deployReady: boolean;
}

export function StatusPill({ applicationId, persistedStatus, deployReady }: StatusPillProps) {
  // Read live turn status from the global SSE subscription and fold
  // it PLUS the dev-server deploy state onto the persisted status so
  // the pill reflects real-time reality ("Working" / "Waiting" /
  // "Unread" / "Live") instead of being stuck at the coarse DB
  // snapshot which almost always reads "Idle".
  const turnStatus = useTurnStatus(featureIdForApplication(applicationId));
  const live = deriveAppLiveStatus(persistedStatus, turnStatus, deployReady);

  return (
    <span className="border-border/60 inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium tracking-wide uppercase">
      <span
        className={cn(
          'relative flex h-1.5 w-1.5 items-center justify-center rounded-full',
          live.dotClass
        )}
      >
        {live.pulse ? (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
              live.dotClass
            )}
          />
        ) : null}
      </span>
      {live.label}
    </span>
  );
}
