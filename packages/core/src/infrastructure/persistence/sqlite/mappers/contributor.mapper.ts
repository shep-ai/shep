/**
 * Contributor Database Mapper (spec 097).
 *
 * Maps between Contributor domain objects and SQLite rows for the
 * `contributors` table (migration 101).
 */

import type {
  Contributor,
  ContributorLane,
  ContributorLevel,
} from '../../../../domain/generated/output.js';

export interface ContributorRow {
  id: string;
  github_login: string;
  display_name: string | null;
  avatar_url: string | null;
  lane: string | null;
  level: string;
  first_contribution_at: number;
  last_contribution_at: number;
  pr_count: number;
  issue_count: number;
  created_at: number;
  updated_at: number;
}

function toMillis(value: Contributor['createdAt']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

export function toDatabase(contributor: Contributor): ContributorRow {
  return {
    id: contributor.id,
    github_login: contributor.githubLogin,
    display_name: contributor.displayName ?? null,
    avatar_url: contributor.avatarUrl ?? null,
    lane: (contributor.lane as string | undefined) ?? null,
    level: contributor.level as string,
    first_contribution_at: toMillis(contributor.firstContributionAt),
    last_contribution_at: toMillis(contributor.lastContributionAt),
    pr_count: contributor.prCount,
    issue_count: contributor.issueCount,
    created_at: toMillis(contributor.createdAt),
    updated_at: toMillis(contributor.updatedAt),
  };
}

export function fromDatabase(row: ContributorRow): Contributor {
  return {
    id: row.id,
    githubLogin: row.github_login,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    lane: (row.lane ?? undefined) as ContributorLane | undefined,
    level: row.level as ContributorLevel,
    firstContributionAt: new Date(row.first_contribution_at),
    lastContributionAt: new Date(row.last_contribution_at),
    prCount: row.pr_count,
    issueCount: row.issue_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
