/**
 * GetWorkerLogPathUseCase
 *
 * Resolves where an agent run's worker log lives. The worker writes under the
 * Shep home, which honours SHEP_HOME; readers that rebuilt the path from
 * `homedir()` looked in `~/.shep` instead (spec 116). Presentation layers ask
 * this use case rather than calling a global home-directory accessor.
 */

import { join } from 'node:path';

import { inject, injectable } from 'tsyringe';

import { featureWorkerLogFileName } from '../../../domain/shared/worker-log.js';
import type { ILogFileStore } from '../../ports/output/services/log-file-store.interface.js';

@injectable()
export class GetWorkerLogPathUseCase {
  constructor(
    @inject('ILogFileStore')
    private readonly store: ILogFileStore
  ) {}

  /** Absolute path of the feature-agent worker log for `runId`. */
  execute(runId: string): string {
    return join(this.store.getLogsDirectory(), featureWorkerLogFileName(runId));
  }
}
