/**
 * CampaignBoard — list of RemediationCampaigns with read-time progress
 * (feature 098, phase 6, task-39 / FR-16 / FR-17).
 *
 * Presentation only. The page fetches campaigns + progress via the
 * list-campaigns / get-campaign-progress use cases and passes them in
 * as `items`. The board renders a card per campaign with a small
 * progress bar, an "X of Y resolved" summary, and badges for at-risk +
 * blocked counts. An optional application filter lets the page filter
 * by a single Application id without re-fetching server data.
 *
 * Accessibility: each card root is a `<section>` with an aria-labelled
 * heading; the progress bar has `role="progressbar"` + aria-valuenow.
 */

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { cn } from '@/lib/utils';
import {
  CampaignStatus,
  type FindingFilter,
  type RemediationCampaign,
} from '@shepai/core/domain/generated/output';

export interface CampaignProgressView {
  total: number;
  closed: number;
  atRisk: number;
  blocked: number;
}

export interface CampaignBoardItem {
  campaign: RemediationCampaign;
  progress: CampaignProgressView | null;
}

export interface CampaignBoardProps {
  items: CampaignBoardItem[];
  loading?: boolean;
  error?: string | null;
  /** When set, restrict to campaigns whose targetQuery includes this application id. */
  applicationFilter?: string | null;
  /**
   * Build the href the "View findings" link points at. Defaults to
   * `/aspm/findings?campaign=<id>`. Override in stories/tests.
   */
  buildFindingsHref?: (campaign: RemediationCampaign) => Route;
  className?: string;
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  [CampaignStatus.Active]:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
  [CampaignStatus.Paused]:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
  [CampaignStatus.Draft]:
    'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
  [CampaignStatus.Completed]:
    'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800',
  [CampaignStatus.Cancelled]:
    'bg-neutral-100 text-neutral-900 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700',
};

function defaultFindingsHref(campaign: RemediationCampaign): Route {
  return `/aspm/findings?campaign=${encodeURIComponent(campaign.id)}` as Route;
}

function targetIncludesApplication(query: FindingFilter, applicationId: string): boolean {
  // Empty applicationIds means "match all"; an unset filter array also means
  // "all" — so restrict only when the query DOES list applications AND the
  // chosen one isn't in the set.
  if (!query.applicationIds || query.applicationIds.length === 0) return true;
  return query.applicationIds.includes(applicationId);
}

function percentClosed(progress: CampaignProgressView | null): number {
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.closed / progress.total) * 100);
}

export function CampaignBoard({
  items,
  loading,
  error,
  applicationFilter,
  buildFindingsHref,
  className,
}: CampaignBoardProps) {
  const href = buildFindingsHref ?? defaultFindingsHref;

  const filteredItems = useMemo(() => {
    if (!applicationFilter) return items;
    return items.filter((item) =>
      targetIncludesApplication(item.campaign.targetQuery, applicationFilter)
    );
  }, [items, applicationFilter]);

  if (loading) {
    return (
      <div
        data-testid="campaign-board-loading"
        className={cn('flex h-32 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading campaigns…</span>
      </div>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="campaign-board-error"
        className={cn(
          'flex h-32 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
        role="alert"
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div
        data-testid="campaign-board-empty"
        className={cn(
          'flex h-32 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No campaigns</span>
        <span className="text-muted-foreground text-xs">
          Run <code>shep aspm campaigns create</code> to create one
        </span>
      </div>
    );
  }

  return (
    <ul
      data-testid="campaign-board"
      className={cn('grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3', className)}
    >
      {filteredItems.map((item) => (
        <li key={item.campaign.id}>
          <CampaignCard item={item} findingsHref={href(item.campaign)} />
        </li>
      ))}
    </ul>
  );
}

interface CampaignCardProps {
  item: CampaignBoardItem;
  findingsHref: Route;
}

function CampaignCard({ item, findingsHref }: CampaignCardProps) {
  const { campaign, progress } = item;
  const pct = percentClosed(progress);
  const headingId = `campaign-${campaign.id}-name`;

  return (
    <section
      data-testid={`campaign-card-${campaign.id}`}
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-3 rounded-md border p-3"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id={headingId} className="text-sm leading-tight font-semibold">
            {campaign.name}
          </h3>
          {campaign.description.length > 0 && (
            <p className="text-muted-foreground line-clamp-2 text-xs">{campaign.description}</p>
          )}
        </div>
        <span
          data-testid={`campaign-card-${campaign.id}-status`}
          className={cn(
            'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
            STATUS_BADGE[campaign.status]
          )}
        >
          {campaign.status}
        </span>
      </header>

      <ProgressRow campaignId={campaign.id} percent={pct} progress={progress} />

      <footer className="flex items-center justify-between gap-2">
        <ProgressBadges progress={progress} />
        <Link
          href={findingsHref}
          data-testid={`campaign-card-${campaign.id}-findings-link`}
          className="text-primary text-xs font-medium underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          View findings →
        </Link>
      </footer>
    </section>
  );
}

interface ProgressRowProps {
  campaignId: string;
  percent: number;
  progress: CampaignProgressView | null;
}

function ProgressRow({ campaignId, percent, progress }: ProgressRowProps) {
  if (progress === null) {
    return (
      <div
        className="text-muted-foreground text-xs"
        data-testid={`campaign-card-${campaignId}-progress-pending`}
      >
        Progress unavailable
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="text-muted-foreground flex items-center justify-between text-[11px]">
        <span>
          {progress.closed} of {progress.total} resolved
        </span>
        <span>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Campaign progress"
        data-testid={`campaign-card-${campaignId}-progress-bar`}
        className="bg-muted h-1.5 w-full overflow-hidden rounded"
      >
        <div
          className="bg-primary h-full"
          style={{ width: `${percent}%` }}
          data-testid={`campaign-card-${campaignId}-progress-bar-fill`}
        />
      </div>
    </div>
  );
}

function ProgressBadges({ progress }: { progress: CampaignProgressView | null }) {
  if (progress === null) return <span />;
  return (
    <div className="flex items-center gap-1.5">
      {progress.atRisk > 0 && (
        <span
          className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          aria-label={`${progress.atRisk} at risk`}
        >
          {progress.atRisk} at risk
        </span>
      )}
      {progress.blocked > 0 && (
        <span
          className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          aria-label={`${progress.blocked} blocked`}
        >
          {progress.blocked} blocked
        </span>
      )}
    </div>
  );
}
