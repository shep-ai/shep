'use client';

import Link from 'next/link';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { HarnessVersionTrend, LearnedHarnessStatus } from '@shepai/core/domain/generated/output';
import { shortId, type HarnessVersionEntry } from './learning-types';

const PERCENT = 100;

const STATUS_TONE: Record<LearnedHarnessStatus, string> = {
  [LearnedHarnessStatus.Adopted]: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  [LearnedHarnessStatus.Candidate]: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  [LearnedHarnessStatus.Rejected]: 'bg-muted text-muted-foreground',
  [LearnedHarnessStatus.RolledBack]: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  [LearnedHarnessStatus.Superseded]: 'bg-muted text-muted-foreground',
};

export interface HarnessVersionListProps {
  versions: readonly HarnessVersionEntry[];
  selectedId?: string;
  /** Link to a version; the page keeps the repository in the URL. */
  hrefFor: (versionId: string) => string;
}

function TrendMark({ trend }: { trend: HarnessVersionTrend }) {
  const { t } = useTranslation('web');
  if (trend === HarnessVersionTrend.Regressed) {
    return (
      <span
        className="flex items-center gap-1 text-[11px] font-medium text-red-600"
        data-testid="version-regressed"
      >
        <AlertTriangle className="h-3 w-3" />
        <TrendingDown className="h-3 w-3" />
        {t('learning.trend.regressed')}
      </span>
    );
  }
  if (trend === HarnessVersionTrend.Improved) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-600">
        <TrendingUp className="h-3 w-3" />
        {t('learning.trend.improved')}
      </span>
    );
  }
  return <span className="text-muted-foreground text-[11px]">{t(`learning.trend.${trend}`)}</span>;
}

/** The repository's learned-harness versions, newest first, with outcome metrics. */
export function HarnessVersionList({ versions, selectedId, hrefFor }: HarnessVersionListProps) {
  const { t } = useTranslation('web');
  if (versions.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-sm" data-testid="learning-no-versions">
        {t('learning.noVersions')}
      </p>
    );
  }
  return (
    <ol className="divide-y" data-testid="harness-version-list">
      {versions.map(({ version, metrics, trend }) => (
        <li key={version.id}>
          <Link
            href={hrefFor(version.id)}
            data-testid={`harness-version-${shortId(version.id)}`}
            aria-current={version.id === selectedId ? 'true' : undefined}
            className={cn(
              'hover:bg-accent flex flex-col gap-1 px-4 py-3 text-sm',
              version.id === selectedId && 'bg-accent'
            )}
          >
            <div className="flex items-center gap-2">
              <code className="text-xs">{shortId(version.id)}</code>
              <Badge variant="outline" className={cn('border-0', STATUS_TONE[version.status])}>
                {t(`learning.status.${version.status}`)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {t(`learning.origin.${version.origin}`)}
              </span>
              <span className="text-muted-foreground ml-auto text-xs">
                {new Date(version.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-muted-foreground">
                {t('learning.metrics.runs', { count: metrics.count })}
              </span>
              {metrics.count > 0 ? (
                <span className="text-muted-foreground">
                  {t('learning.metrics.mergeRate', {
                    percent: Math.round(metrics.mergeRate * PERCENT),
                  })}
                </span>
              ) : null}
              <TrendMark trend={trend} />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
