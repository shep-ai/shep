/**
 * RecomputeAllRiskScoresUseCase (feature 098, phase 5, task-28).
 *
 * Bulk re-scores every finding matching the supplied filter (default: all
 * open findings). Used on:
 *   - SecurityPolicy weight or window change.
 *   - KEV / EPSS feed refresh.
 *   - Manual operator trigger.
 *
 * Iterates in pages so memory stays bounded on the 50k-finding budget
 * (NFR-7). A single failure isolates to its finding — the next page is
 * still processed and the failure is recorded in the result.
 *
 * Application-layer only: no infra imports, delegates per-finding work to
 * the {@link ComputeRiskScoreForFindingUseCase}.
 */

import { inject, injectable } from 'tsyringe';

import { FindingState, type FindingFilter } from '../../../../domain/generated/output.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import { ComputeRiskScoreForFindingUseCase } from './compute-risk-score-for-finding.js';

export interface RecomputeAllRiskScoresInput {
  /** Optional filter — defaults to all Open findings. */
  filter?: FindingFilter;
  /** Page size walked through the repository. Defaults to 200. */
  pageSize?: number;
}

export interface RecomputeAllRiskScoresFailure {
  findingId: string;
  message: string;
}

export interface RecomputeAllRiskScoresResult {
  /** Findings whose score was recomputed successfully. */
  succeeded: number;
  /** Findings that errored individually (the run continued past them). */
  failed: RecomputeAllRiskScoresFailure[];
  /** Total findings considered (succeeded + failed). */
  total: number;
}

const DEFAULT_PAGE_SIZE = 200;

@injectable()
export class RecomputeAllRiskScoresUseCase {
  constructor(
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject(ComputeRiskScoreForFindingUseCase)
    private readonly compute: ComputeRiskScoreForFindingUseCase
  ) {}

  async execute(input: RecomputeAllRiskScoresInput = {}): Promise<RecomputeAllRiskScoresResult> {
    const limit = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter: FindingFilter = input.filter ?? { states: [FindingState.Open] };

    let offset = 0;
    let succeeded = 0;
    const failed: RecomputeAllRiskScoresFailure[] = [];
    let total = 0;

    // Walk the result set page-by-page. The first page reports the total
    // count; subsequent pages skip the count by reusing it.
    // We keep the loop bounded by `total` (not by an empty page) so a
    // page that returns 0 due to a race still terminates cleanly.
    while (true) {
      const page = await this.findingRepo.list(filter, { offset, limit });
      if (offset === 0) total = page.total;
      if (page.items.length === 0) break;

      for (const finding of page.items) {
        try {
          await this.compute.execute({ findingId: finding.id });
          succeeded += 1;
        } catch (err) {
          failed.push({
            findingId: finding.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      offset += page.items.length;
      if (offset >= total) break;
    }

    return { succeeded, failed, total };
  }
}
