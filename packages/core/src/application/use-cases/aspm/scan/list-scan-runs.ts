/**
 * ListScanRunsUseCase (Phase 11, task-75). Returns the latest N ScanRun
 * rows for an application — powers the /aspm scan history view.
 */

import { inject, injectable } from 'tsyringe';
import type { ScanRun } from '../../../../domain/generated/output.js';
import type { IScanRunRepository } from '../../../ports/output/repositories/scan-run-repository.interface.js';

export interface ListScanRunsInput {
  applicationId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 20;

@injectable()
export class ListScanRunsUseCase {
  constructor(@inject('IScanRunRepository') private readonly repo: IScanRunRepository) {}

  execute(input: ListScanRunsInput): Promise<ScanRun[]> {
    return this.repo.listLatestForApplication(input.applicationId, input.limit ?? DEFAULT_LIMIT);
  }
}
