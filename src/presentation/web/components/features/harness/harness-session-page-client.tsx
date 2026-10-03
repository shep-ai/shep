'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { HarnessSessionOrigin } from '@shepai/core/domain/generated/output';
import type { HarnessSessionDetail } from '@shepai/core/application/use-cases/harness/get-harness-session.use-case';
import { getHarnessSession } from '@/app/actions/harness-queries';
import { useHarnessLive } from '@/hooks/use-harness-live';
import { HarnessSessionView } from './harness-session-view';
import { HarnessSessionActions } from './harness-session-actions';

export interface HarnessSessionPageClientProps {
  detail: HarnessSessionDetail;
}

/** /harness/[id]: a live session page with its standalone outcome actions (spec 119, F4/F6). */
export function HarnessSessionPageClient({ detail: initial }: HarnessSessionPageClientProps) {
  const { t } = useTranslation('web');
  const [detail, setDetail] = useState(initial);
  const refresh = useCallback(() => {
    void getHarnessSession(initial.session.id).then((r) => {
      if (r.ok) setDetail(r.data);
    });
  }, [initial.session.id]);
  useHarnessLive(initial.session.id, refresh);
  const s = detail.session;

  return (
    <div className="space-y-4" data-testid="harness-session-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/harness" className="text-muted-foreground text-xs hover:underline">
            ← {t('harness.title')}
          </Link>
          <h1 className="truncate text-lg font-semibold">{s.title}</h1>
          <p className="text-muted-foreground text-xs">
            {t(`harness.origin.${s.origin}`)} · {t(`harness.mode.${s.mode}`)} ·{' '}
            {t(`harness.sessionStatus.${s.status}`)}
            {s.worktreeBranch ? ` · ${s.worktreeBranch}` : ''}
          </p>
        </div>
        {s.origin === HarnessSessionOrigin.Standalone ? (
          <HarnessSessionActions
            session={s}
            latestTaskStatus={detail.tasks.at(-1)?.task.status}
            onChanged={refresh}
          />
        ) : null}
      </div>
      <HarnessSessionView detail={detail} onChanged={refresh} />
    </div>
  );
}
