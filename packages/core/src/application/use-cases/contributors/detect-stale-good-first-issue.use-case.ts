/**
 * DetectStaleGoodFirstIssueUseCase — spec 097, FR-29.
 *
 * Returns the structured list of `good-first-issue`-labeled issues whose
 * last activity is older than the configured threshold. Pure: no side-
 * effects. Caller (CLI command, scheduler tick, web route) decides what
 * to do with the result (notify, surface in dashboard, auto-close, …).
 */

import { inject, injectable } from 'tsyringe';

import type {
  ExternalIssueSummary,
  IExternalIssueFetcher,
} from '../../ports/output/services/external-issue-fetcher.interface.js';

const DEFAULT_STALE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const GOOD_FIRST_ISSUE_LABEL = 'good-first-issue';

export interface DetectStaleGoodFirstIssueInput {
  owner: string;
  repo: string;
  /** Stale threshold in days. Defaults to 30. Must be > 0. */
  staleDays?: number;
  /** Override "now" — useful for deterministic tests. */
  now?: Date;
}

export interface StaleIssue {
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
  url: string;
  /** ISO 8601 timestamp the fetcher reported as the last activity. */
  lastActivityAt: string;
  /** Whole days since `lastActivityAt` at the time of the call. */
  staleForDays: number;
}

export interface DetectStaleGoodFirstIssueResult {
  thresholdDays: number;
  stale: readonly StaleIssue[];
}

@injectable()
export class DetectStaleGoodFirstIssueUseCase {
  constructor(
    @inject('IExternalIssueFetcher')
    private readonly fetcher: IExternalIssueFetcher
  ) {}

  async execute(input: DetectStaleGoodFirstIssueInput): Promise<DetectStaleGoodFirstIssueResult> {
    const thresholdDays = resolveThresholdDays(input.staleDays);
    const now = (input.now ?? new Date()).getTime();
    const cutoffMs = now - thresholdDays * MS_PER_DAY;

    const candidates = await this.fetcher.listIssuesByLabel(
      input.owner,
      input.repo,
      GOOD_FIRST_ISSUE_LABEL
    );

    const stale = candidates
      .filter((issue) => Date.parse(issue.lastActivityAt) <= cutoffMs)
      .map((issue) => toStaleIssue(issue, now));

    return { thresholdDays, stale };
  }
}

function resolveThresholdDays(provided: number | undefined): number {
  if (provided === undefined) return DEFAULT_STALE_DAYS;
  if (!Number.isFinite(provided) || provided <= 0) {
    throw new Error(`staleDays must be a positive number; got ${provided}`);
  }
  return provided;
}

function toStaleIssue(issue: ExternalIssueSummary, nowMs: number): StaleIssue {
  return {
    owner: issue.owner,
    repo: issue.repo,
    issueNumber: issue.issueNumber,
    title: issue.title,
    url: issue.url,
    lastActivityAt: issue.lastActivityAt,
    staleForDays: Math.floor((nowMs - Date.parse(issue.lastActivityAt)) / MS_PER_DAY),
  };
}
