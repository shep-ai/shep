/**
 * GetScanRunUseCase (Phase 11, task-75). Returns a single ScanRun by id
 * with full stage detail. Powers the scan-progress drawer.
 */

import { inject, injectable } from 'tsyringe';
import type { ScanRun } from '../../../../domain/generated/output.js';
import type { IScanRunRepository } from '../../../ports/output/repositories/scan-run-repository.interface.js';

@injectable()
export class GetScanRunUseCase {
  constructor(@inject('IScanRunRepository') private readonly repo: IScanRunRepository) {}

  execute(scanRunId: string): Promise<ScanRun | null> {
    return this.repo.findById(scanRunId);
  }
}
