'use client';

/**
 * ContributorLeaderboard — spec 097, FR-38.
 *
 * Read-only leaderboard rendering top contributors by PR count for a given
 * scope (current month / all-time). Pure presentation: data is supplied via
 * props by a server component that calls GetContributorLeaderboardUseCase.
 */

import { Trophy, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ContributorLevel, type ContributorLane } from '@shepai/core/domain/generated/output';
import { useTranslation } from 'react-i18next';

export interface LeaderboardEntry {
  login: string;
  displayName?: string;
  avatarUrl?: string;
  prCount: number;
  level: ContributorLevel;
  lane?: ContributorLane;
}

export type LeaderboardScope = 'month' | 'allTime';

export interface ContributorLeaderboardProps {
  scope: LeaderboardScope;
  entries: readonly LeaderboardEntry[];
  loading?: boolean;
  error?: string;
}

const LEVEL_VARIANT: Record<ContributorLevel, 'default' | 'secondary' | 'outline'> = {
  [ContributorLevel.Maintainer]: 'default',
  [ContributorLevel.Core]: 'default',
  [ContributorLevel.Contributor]: 'secondary',
  [ContributorLevel.User]: 'outline',
};

const SCOPE_LABEL: Record<LeaderboardScope, string> = {
  month: 'This month',
  allTime: 'All time',
};

export function ContributorLeaderboard({
  scope,
  entries,
  loading,
  error,
}: ContributorLeaderboardProps) {
  const { t } = useTranslation('web');

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="contributor-leaderboard"
      aria-label={t('contributors.leaderboard.ariaLabel', {
        defaultValue: 'Contributor leaderboard',
      })}
    >
      <header className="flex items-center gap-2">
        <Trophy className="text-primary size-5" aria-hidden />
        <h2 className="text-lg font-semibold">
          {t('contributors.leaderboard.title', { defaultValue: 'Top contributors' })}
        </h2>
        <Badge variant="secondary" className="ml-1">
          {t(`contributors.leaderboard.scopes.${scope}`, { defaultValue: SCOPE_LABEL[scope] })}
        </Badge>
      </header>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border" data-testid="leaderboard-list">
          {entries.map((entry, index) => (
            <LeaderboardRow key={entry.login} rank={index + 1} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

interface RowProps {
  rank: number;
  entry: LeaderboardEntry;
}

function LeaderboardRow({ rank, entry }: RowProps) {
  const { t } = useTranslation('web');

  return (
    <li
      className="flex items-center gap-3 px-3 py-2"
      data-testid={`leaderboard-row-${entry.login}`}
    >
      <span
        className="text-muted-foreground w-6 shrink-0 text-right font-mono text-xs"
        data-testid={`leaderboard-rank-${entry.login}`}
      >
        {rank === 1 ? (
          <Crown className="ml-auto size-3.5 text-amber-500" aria-hidden />
        ) : (
          `#${rank}`
        )}
      </span>
      <Avatar entry={entry} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p
          className="truncate text-sm font-medium"
          data-testid={`leaderboard-login-${entry.login}`}
        >
          {entry.displayName ?? entry.login}
        </p>
        <p className="text-muted-foreground text-xs">
          @{entry.login}
          {entry.lane
            ? ` · ${t(`contributors.lanes.${entry.lane}.label`, {
                defaultValue: entry.lane,
              })}`
            : ''}
        </p>
      </div>
      <Badge
        variant={LEVEL_VARIANT[entry.level] ?? 'outline'}
        className="shrink-0 capitalize"
        data-testid={`leaderboard-level-${entry.login}`}
      >
        {t(`contributors.leaderboard.levels.${entry.level}`, { defaultValue: entry.level })}
      </Badge>
      <span
        className="w-12 shrink-0 text-right text-sm tabular-nums"
        data-testid={`leaderboard-prs-${entry.login}`}
      >
        {t('contributors.leaderboard.prCount', {
          count: entry.prCount,
          defaultValue: `${entry.prCount} PR${entry.prCount === 1 ? '' : 's'}`,
        })}
      </span>
    </li>
  );
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  const initial = (entry.displayName ?? entry.login).slice(0, 1).toUpperCase();
  if (entry.avatarUrl) {
    return (
      <span
        className="size-7 shrink-0 overflow-hidden rounded-full border"
        data-testid={`leaderboard-avatar-${entry.login}`}
        style={{
          backgroundImage: `url(${entry.avatarUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
      data-testid={`leaderboard-avatar-${entry.login}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function LoadingState() {
  return (
    <ul className="flex flex-col divide-y rounded-lg border" data-testid="leaderboard-loading">
      {(['l1', 'l2', 'l3'] as const).map((k) => (
        <li key={k} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-5 w-16" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  const { t } = useTranslation('web');

  return (
    <p
      className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
      data-testid="leaderboard-empty"
    >
      {t('contributors.leaderboard.empty', {
        defaultValue: 'No contributors yet — be the first to merge a PR!',
      })}
    </p>
  );
}

function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation('web');

  return (
    <p
      className="text-destructive bg-destructive/5 border-destructive/40 rounded-lg border p-4 text-sm"
      data-testid="leaderboard-error"
      role="alert"
    >
      {t('contributors.leaderboard.error', {
        message,
        defaultValue: "Couldn't load the leaderboard: {{message}}",
      })}
    </p>
  );
}
