/**
 * GetCuratedIssuesByLaneUseCase — spec 097, FR-37.
 *
 * Returns curated good-first-issues filtered by chosen lane. Backs the
 * web "pick your first issue" CTA. Stale issues (older than the
 * configured threshold) are excluded so newcomers do not land on
 * abandoned tickets.
 */

import { inject, injectable } from 'tsyringe';

import { ContributionDifficulty, type ContributorLane } from '../../../domain/generated/output.js';
import type {
  ExternalIssueSummary,
  IExternalIssueFetcher,
} from '../../ports/output/services/external-issue-fetcher.interface.js';

const GOOD_FIRST_ISSUE_LABEL = 'good-first-issue';
const DEFAULT_STALE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Repository, lane, and freshness filters for curated newcomer issues.
 */
export interface GetCuratedIssuesByLaneInput {
  /** GitHub repository owner or organization login. */
  owner: string;
  /** GitHub repository name within `owner`. */
  repo: string;
  /** Contributor lane that must be represented by issue labels. */
  lane: ContributorLane;
  /** Threshold past which an issue is considered stale and excluded. */
  staleDays?: number;
  /** Override "now" — useful for deterministic tests. */
  now?: Date;
}

/**
 * Good-first issue prepared for the lane-specific contributor picker.
 */
export interface CuratedIssue {
  /** GitHub repository owner or organization login. */
  owner: string;
  /** GitHub repository name within `owner`. */
  repo: string;
  /** GitHub issue number scoped to the repository. */
  issueNumber: number;
  /** Current issue title returned by the external issue fetcher. */
  title: string;
  /** Browser URL for the issue. */
  url: string;
  /** Lane used to curate this issue. */
  lane: ContributorLane;
  /** Difficulty inferred from issue labels. */
  difficulty: ContributionDifficulty;
  /** Markdown-style acceptance criteria carried verbatim if present in labels. */
  acceptanceCriteria?: string;
}

/**
 * Curated issue result for one requested contributor lane.
 */
export interface GetCuratedIssuesByLaneResult {
  /** Requested lane represented by every issue in `issues`. */
  lane: ContributorLane;
  /** Fresh, good-first issues matching the requested lane. */
  issues: readonly CuratedIssue[];
}

@injectable()
export class GetCuratedIssuesByLaneUseCase {
  constructor(
    @inject('IExternalIssueFetcher')
    private readonly fetcher: IExternalIssueFetcher
  ) {}

  async execute(input: GetCuratedIssuesByLaneInput): Promise<GetCuratedIssuesByLaneResult> {
    const labels = [GOOD_FIRST_ISSUE_LABEL, `lane:${input.lane}`];
    const candidates = await this.fetcher.listIssuesByLabels(input.owner, input.repo, labels);

    const cutoff =
      (input.now?.getTime() ?? Date.now()) - (input.staleDays ?? DEFAULT_STALE_DAYS) * MS_PER_DAY;

    const issues = candidates
      .filter((issue) => Date.parse(issue.lastActivityAt) > cutoff)
      .map((issue) => toCurated(issue, input.lane));

    return { lane: input.lane, issues };
  }
}

function toCurated(issue: ExternalIssueSummary, lane: ContributorLane): CuratedIssue {
  return {
    owner: issue.owner,
    repo: issue.repo,
    issueNumber: issue.issueNumber,
    title: issue.title,
    url: issue.url,
    lane,
    difficulty: difficultyFromLabels(issue.labels),
  };
}

function difficultyFromLabels(labels: readonly string[]): ContributionDifficulty {
  const lc = labels.map((l) => l.toLowerCase());
  if (lc.includes('difficulty:hard') || lc.includes('hard')) return ContributionDifficulty.Hard;
  if (lc.includes('difficulty:medium') || lc.includes('medium')) {
    return ContributionDifficulty.Medium;
  }
  if (lc.includes('difficulty:easy') || lc.includes('easy')) return ContributionDifficulty.Easy;
  return ContributionDifficulty.GoodFirst;
}
