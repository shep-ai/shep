/**
 * ListFindingsUseCase (feature 098, phase 3, FR-14 / NFR-8).
 *
 * Paged + filterable list of security findings backed by the
 * {@link FindingFilter} primitive — the same primitive that drives
 * rank-findings (phase 5) and remediation-campaign queries (phase 6).
 *
 * The use case is intentionally thin: it normalizes the cursor and
 * forwards to the repository. Filter semantics live with the repository's
 * filter-to-SQL helper; ordering / KEV enrichment is layered in by the
 * dedicated rank-findings use case later.
 */

import { inject, injectable } from 'tsyringe';

import type { FindingFilter, SecurityFinding } from '../../../../domain/generated/output.js';
import type {
  IFindingRepository,
  ListFindingsCursor,
} from '../../../ports/output/repositories/finding-repository.interface.js';

export interface ListFindingsInput {
  filter?: FindingFilter;
  cursor?: Partial<ListFindingsCursor>;
}

export interface ListFindingsResult {
  items: SecurityFinding[];
  total: number;
  /** Echoed for pagination UIs. */
  offset: number;
  /** Echoed for pagination UIs. */
  limit: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const DEFAULT_OFFSET = 0;

@injectable()
export class ListFindingsUseCase {
  constructor(@inject('IFindingRepository') private readonly repo: IFindingRepository) {}

  async execute(input: ListFindingsInput = {}): Promise<ListFindingsResult> {
    const offset = Math.max(0, input.cursor?.offset ?? DEFAULT_OFFSET);
    const requestedLimit = input.cursor?.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
    const filter = input.filter ?? {};

    const result = await this.repo.list(filter, { offset, limit });
    return {
      items: result.items,
      total: result.total,
      offset,
      limit,
    };
  }
}
