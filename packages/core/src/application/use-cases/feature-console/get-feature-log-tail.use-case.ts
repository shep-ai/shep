/**
 * Get Feature Log Tail Use Case (spec 142)
 *
 * The last lines of a feature's current run log, for the console's log pane.
 * The path comes from `GetWorkerLogPathUseCase` (which honours SHEP_HOME), and
 * the read goes through the log store port.
 */

import { inject, injectable } from 'tsyringe';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { ILogFileStore } from '../../ports/output/services/log-file-store.interface.js';
import { GetWorkerLogPathUseCase } from '../logs/get-worker-log-path.use-case.js';
import type { FeatureLogTail } from './feature-console.types.js';

@injectable()
export class GetFeatureLogTailUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(GetWorkerLogPathUseCase)
    private readonly logPath: GetWorkerLogPathUseCase,
    @inject('ILogFileStore')
    private readonly store: ILogFileStore
  ) {}

  /**
   * @param featureId - Feature id or id prefix.
   * @param maxLines - How many of the newest lines to return.
   */
  async execute(featureId: string, maxLines: number): Promise<FeatureLogTail> {
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature?.agentRunId) {
      return { lines: [] };
    }
    const logPath = this.logPath.execute(feature.agentRunId);
    return { logPath, lines: await this.store.readTail(logPath, maxLines) };
  }
}
