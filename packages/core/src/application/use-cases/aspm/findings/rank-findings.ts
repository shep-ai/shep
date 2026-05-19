/**
 * RankFindingsUseCase (feature 098, phase 5, task-29).
 *
 * Returns findings ordered by composite risk score descending — the
 * dashboard's "top at-risk" view. Reuses the {@link FindingFilter}
 * primitive so list-findings, campaign queries, and ranked views all
 * share one filter shape (research decision 9 / 18).
 *
 * Performance: the repository's `listRanked` joins against the current
 * RiskScore row via `current_risk_score_id` (FK pointer) — O(1) join per
 * finding rather than a window function over the full risk_scores
 * history. NFR-8 budget: <300ms on a 50k-finding dataset.
 */

import { inject, injectable } from 'tsyringe';

import type { FindingFilter } from '../../../../domain/generated/output.js';
import type {
  IFindingRepository,
  ListFindingsCursor,
  RankedFinding,
} from '../../../ports/output/repositories/finding-repository.interface.js';

export interface RankFindingsInput {
  filter?: FindingFilter;
  cursor?: Partial<ListFindingsCursor>;
}

export interface RankFindingsResult {
  items: RankedFinding[];
  total: number;
  offset: number;
  limit: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const DEFAULT_OFFSET = 0;

@injectable()
export class RankFindingsUseCase {
  constructor(@inject('IFindingRepository') private readonly repo: IFindingRepository) {}

  async execute(input: RankFindingsInput = {}): Promise<RankFindingsResult> {
    const offset = Math.max(0, input.cursor?.offset ?? DEFAULT_OFFSET);
    const requestedLimit = input.cursor?.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
    const filter = input.filter ?? {};

    const result = await this.repo.listRanked(filter, { offset, limit });
    return {
      items: result.items,
      total: result.total,
      offset,
      limit,
    };
  }
}
