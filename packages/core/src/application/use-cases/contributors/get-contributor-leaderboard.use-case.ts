/**
 * GetContributorLeaderboardUseCase — spec 097, FR-38.
 *
 * Returns top contributors by PR count for a given scope (month / all-time)
 * with a configurable limit. Backs the web `ContributorLeaderboard`
 * component. Repository aggregation runs at request time (research
 * decision: no materialized view in v1).
 */

import { inject, injectable } from 'tsyringe';

import {
  type Contributor,
  type ContributorLane,
  type ContributorLevel,
} from '../../../domain/generated/output.js';
import type {
  ContributorLeaderboardScope,
  IContributorRepository,
} from '../../ports/output/repositories/contributor-repository.interface.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Leaderboard query scope and optional row limit.
 */
export interface GetContributorLeaderboardInput {
  /** Time window for repository aggregation, for example month or all-time. */
  scope: ContributorLeaderboardScope;
  /** Maximum number of rows to return; defaults to 10 and is capped at 100. */
  limit?: number;
}

/**
 * Display-ready contributor row for leaderboard UI and API consumers.
 */
export interface ContributorLeaderboardEntry {
  /** GitHub login for the contributor. */
  login: string;
  /** Optional display name from the contributor profile. */
  displayName?: string;
  /** Optional avatar URL suitable for browser display. */
  avatarUrl?: string;
  /** Number of merged pull requests counted for the selected scope. */
  prCount: number;
  /** Current contributor ladder level. */
  level: ContributorLevel;
  /** Primary contributor lane, when known. */
  lane?: ContributorLane;
}

/**
 * Leaderboard result with the effective scope, limit, and ordered entries.
 */
export interface GetContributorLeaderboardResult {
  /** Scope used for repository aggregation. */
  scope: ContributorLeaderboardScope;
  /** Effective row limit after defaulting and clamping. */
  limit: number;
  /** Ordered leaderboard entries, highest PR count first. */
  entries: readonly ContributorLeaderboardEntry[];
}

@injectable()
export class GetContributorLeaderboardUseCase {
  constructor(
    @inject('IContributorRepository')
    private readonly contributors: IContributorRepository
  ) {}

  async execute(input: GetContributorLeaderboardInput): Promise<GetContributorLeaderboardResult> {
    const limit = clampLimit(input.limit);
    const rows = await this.contributors.findTopByPrCount({ scope: input.scope, limit });
    return {
      scope: input.scope,
      limit,
      entries: rows.map(toEntry),
    };
  }
}

function clampLimit(provided: number | undefined): number {
  if (provided === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(provided) || provided <= 0) {
    throw new Error(`limit must be a positive number; got ${provided}`);
  }
  return Math.min(Math.floor(provided), MAX_LIMIT);
}

function toEntry(c: Contributor): ContributorLeaderboardEntry {
  return {
    login: c.githubLogin,
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    prCount: c.prCount,
    level: c.level,
    lane: c.lane,
  };
}
