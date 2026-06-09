/**
 * BulkConvertFindingsUseCase (feature 098, phase 7, task-45).
 *
 * Accepts a {@link FindingFilter} (same shape used by list/rank/campaigns)
 * and creates one WorkItem per matching SecurityFinding. Idempotent on
 * existing linkage — findings whose `workItemId` is already set are
 * skipped. Failures on individual findings are recorded in the result so
 * one bad row doesn't abort the batch (FR-28).
 */

import { inject, injectable } from 'tsyringe';

import type { FindingFilter } from '../../../../domain/generated/output.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import { ConvertFindingToWorkItemUseCase } from './convert-finding-to-work-item.js';

export interface BulkConvertFindingsInput {
  filter: FindingFilter;
  projectId: string;
  stateId?: string;
  /** Cap on findings processed per call. Default 500. */
  maxFindings?: number;
}

export interface BulkConvertFailure {
  findingId: string;
  error: string;
}

export interface BulkConvertFindingsResult {
  totalMatched: number;
  created: number;
  skipped: number;
  failures: BulkConvertFailure[];
}

const DEFAULT_MAX = 500;

@injectable()
export class BulkConvertFindingsUseCase {
  constructor(
    @inject('IFindingRepository') private readonly findings: IFindingRepository,
    @inject(ConvertFindingToWorkItemUseCase)
    private readonly convert: ConvertFindingToWorkItemUseCase
  ) {}

  async execute(input: BulkConvertFindingsInput): Promise<BulkConvertFindingsResult> {
    const limit = Math.max(1, input.maxFindings ?? DEFAULT_MAX);
    const list = await this.findings.list(input.filter, { offset: 0, limit });

    let created = 0;
    let skipped = 0;
    const failures: BulkConvertFailure[] = [];

    for (const finding of list.items) {
      try {
        const result = await this.convert.execute({
          findingId: finding.id,
          projectId: input.projectId,
          stateId: input.stateId,
        });
        if (result.alreadyLinked) {
          skipped += 1;
        } else {
          created += 1;
        }
      } catch (err) {
        failures.push({
          findingId: finding.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      totalMatched: list.total,
      created,
      skipped,
      failures,
    };
  }
}
