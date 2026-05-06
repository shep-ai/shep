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

export interface GetContributorLeaderboardInput {
  scope: ContributorLeaderboardScope;
  limit?: number;
}

export interface ContributorLeaderboardEntry {
  login: string;
  displayName?: string;
  avatarUrl?: string;
  prCount: number;
  level: ContributorLevel;
  lane?: ContributorLane;
}

export interface GetContributorLeaderboardResult {
  scope: ContributorLeaderboardScope;
  limit: number;
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
