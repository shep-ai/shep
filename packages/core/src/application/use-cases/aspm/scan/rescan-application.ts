/**
 * RescanApplicationUseCase (Phase 11, task-75). Thin wrapper that defaults
 * `triggeredBy` to `Schedule` when invoked by the nightly scheduler and to
 * `User` when invoked by the UI/CLI. Same orchestration as a fresh scan —
 * the dedup unique index makes a rescan idempotent.
 */

import { inject, injectable } from 'tsyringe';
import { ScanTrigger, type ScanStageName } from '../../../../domain/generated/output.js';
import { ScanApplicationUseCase, type ScanApplicationResult } from './scan-application.js';

export interface RescanApplicationInput {
  applicationId: string;
  triggeredBy?: ScanTrigger;
  stagesEnabled?: ScanStageName[];
}

@injectable()
export class RescanApplicationUseCase {
  constructor(@inject(ScanApplicationUseCase) private readonly scan: ScanApplicationUseCase) {}

  execute(input: RescanApplicationInput): Promise<ScanApplicationResult> {
    return this.scan.execute({
      applicationId: input.applicationId,
      stagesEnabled: input.stagesEnabled,
      triggeredBy: input.triggeredBy ?? ScanTrigger.User,
    });
  }
}
