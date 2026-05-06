'use client';

/**
 * CuratedIssuesList — spec 097, FR-37 / task-45.
 *
 * Renders the result of GetCuratedIssuesByLaneUseCase as a list of issue
 * cards: title, difficulty badge, acceptance-criteria preview, and a link
 * to the GitHub issue. Pure presentation — data comes via props.
 */

import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ContributionDifficulty, type ContributorLane } from '@shepai/core/domain/generated/output';

export interface CuratedIssueView {
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
  url: string;
  lane: ContributorLane;
  difficulty: ContributionDifficulty;
  acceptanceCriteria?: string;
}

export interface CuratedIssuesListProps {
  issues: readonly CuratedIssueView[];
  loading?: boolean;
  error?: string;
}

const DIFFICULTY_VARIANT: Record<
  ContributionDifficulty,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  [ContributionDifficulty.GoodFirst]: 'default',
  [ContributionDifficulty.Easy]: 'secondary',
  [ContributionDifficulty.Medium]: 'outline',
  [ContributionDifficulty.Hard]: 'destructive',
};

const DIFFICULTY_LABEL: Record<ContributionDifficulty, string> = {
  [ContributionDifficulty.GoodFirst]: 'good first',
  [ContributionDifficulty.Easy]: 'easy',
  [ContributionDifficulty.Medium]: 'medium',
  [ContributionDifficulty.Hard]: 'hard',
};

const PREVIEW_MAX_LEN = 160;

export function CuratedIssuesList({ issues, loading, error }: CuratedIssuesListProps) {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="curated-issues-list"
      aria-label="Curated good-first-issues"
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : issues.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="curated-issues-list-items">
          {issues.map((issue) => (
            <IssueCard key={`${issue.owner}/${issue.repo}#${issue.issueNumber}`} issue={issue} />
          ))}
        </ul>
      )}
    </section>
  );
}

function IssueCard({ issue }: { issue: CuratedIssueView }) {
  const slug = `${issue.owner}/${issue.repo}#${issue.issueNumber}`;
  const preview = previewCriteria(issue.acceptanceCriteria);
  return (
    <li
      className="bg-card flex flex-col gap-2 rounded-lg border p-3"
      data-testid={`curated-issue-${issue.issueNumber}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 truncate text-sm font-medium hover:underline"
            data-testid={`curated-issue-link-${issue.issueNumber}`}
          >
            {issue.title}
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
          <p className="text-muted-foreground text-xs">{slug}</p>
        </div>
        <Badge
          variant={DIFFICULTY_VARIANT[issue.difficulty] ?? 'outline'}
          className="shrink-0"
          data-testid={`curated-issue-difficulty-${issue.issueNumber}`}
        >
          {DIFFICULTY_LABEL[issue.difficulty] ?? issue.difficulty}
        </Badge>
      </div>
      {preview ? (
        <p
          className="text-muted-foreground line-clamp-2 text-xs"
          data-testid={`curated-issue-preview-${issue.issueNumber}`}
        >
          {preview}
        </p>
      ) : null}
    </li>
  );
}

function previewCriteria(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= PREVIEW_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, PREVIEW_MAX_LEN - 1)}…`;
}

function LoadingState() {
  return (
    <ul className="flex flex-col gap-3" data-testid="curated-issues-loading">
      {(['l1', 'l2', 'l3'] as const).map((k) => (
        <li key={k} className="bg-card flex flex-col gap-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <p
      className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
      data-testid="curated-issues-empty"
    >
      No good-first-issues open in this lane right now — check back soon, or pick a different lane.
    </p>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <p
      className="text-destructive bg-destructive/5 border-destructive/40 rounded-lg border p-4 text-sm"
      data-testid="curated-issues-error"
      role="alert"
    >
      Couldn&apos;t load curated issues: {message}
    </p>
  );
}
