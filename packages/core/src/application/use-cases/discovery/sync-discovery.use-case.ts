/**
 * SyncDiscoveryUseCase (spec 128): the daemon's pass — run discovery in every
 * space whose schedule is due, one after another. A failing space does not
 * stop the others.
 */

import { injectable, inject } from 'tsyringe';
import { isIntervalDue } from '../../../domain/shared/interval-schedule.js';
import type { IOpportunityWeightsRepository } from '../../ports/output/repositories/opportunity-repository.interface.js';
import type { IDiscoveryRunRepository } from '../../ports/output/repositories/discovery-run-repository.interface.js';
import { errorMessage } from '../connections/connection-refs.js';
import { RunDiscoveryUseCase } from './run-discovery.use-case.js';

const MINUTES_PER_HOUR = 60;

export interface DiscoveryPassOutcome {
  spaceId: string;
  ok: boolean;
  error?: string;
}

@injectable()
export class SyncDiscoveryUseCase {
  constructor(
    @inject('IOpportunityWeightsRepository')
    private readonly weights: IOpportunityWeightsRepository,
    @inject('IDiscoveryRunRepository') private readonly runs: IDiscoveryRunRepository,
    @inject(RunDiscoveryUseCase) private readonly run: RunDiscoveryUseCase
  ) {}

  async runDue(now: Date): Promise<DiscoveryPassOutcome[]> {
    const outcomes: DiscoveryPassOutcome[] = [];
    for (const schedule of await this.weights.listScheduled()) {
      const latest = await this.runs.latest(schedule.spaceId);
      const due = isIntervalDue(
        {
          enabled: true,
          intervalMinutes: (schedule.discoveryEveryHours ?? 0) * MINUTES_PER_HOUR,
          ...(latest ? { lastRunAt: latest.createdAt } : {}),
        },
        now
      );
      if (!due) continue;
      try {
        const result = await this.run.execute({ space: schedule.spaceId });
        outcomes.push(
          result.ok
            ? { spaceId: schedule.spaceId, ok: true }
            : { spaceId: schedule.spaceId, ok: false, error: result.error }
        );
      } catch (error: unknown) {
        outcomes.push({ spaceId: schedule.spaceId, ok: false, error: errorMessage(error) });
      }
    }
    return outcomes;
  }
}
