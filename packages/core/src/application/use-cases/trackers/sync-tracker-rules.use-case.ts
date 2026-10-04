/**
 * SyncTrackerRulesUseCase (spec 122)
 *
 * Runs several sync rules one after another: the ones whose interval has
 * passed (the daemon's minute tick), or every enabled one (`shep sync run`,
 * "Sync now"). Rules run sequentially so two runs never write the same
 * project at once.
 */

import { injectable, inject } from 'tsyringe';
import { isIntervalDue } from '../../../domain/shared/interval-schedule.js';
import type { ITrackerSyncRuleRepository } from '../../ports/output/repositories/tracker-sync-rule-repository.interface.js';
import { RunTrackerSyncUseCase, type TrackerSyncOutcome } from './run-tracker-sync.use-case.js';
import type { ConnectionResult } from '../connections/connection-refs.js';

@injectable()
export class SyncTrackerRulesUseCase {
  constructor(
    @inject('ITrackerSyncRuleRepository') private readonly rules: ITrackerSyncRuleRepository,
    @inject(RunTrackerSyncUseCase) private readonly runRule: RunTrackerSyncUseCase
  ) {}

  async runDue(now: Date): Promise<ConnectionResult<TrackerSyncOutcome>[]> {
    const due = (await this.rules.list()).filter((rule) => isIntervalDue(rule, now));
    return this.runEach(due.map((rule) => rule.id));
  }

  async runAll(): Promise<ConnectionResult<TrackerSyncOutcome>[]> {
    const enabled = (await this.rules.list()).filter((rule) => rule.enabled);
    return this.runEach(enabled.map((rule) => rule.id));
  }

  private async runEach(ids: string[]): Promise<ConnectionResult<TrackerSyncOutcome>[]> {
    const results: ConnectionResult<TrackerSyncOutcome>[] = [];
    for (const id of ids) results.push(await this.runRule.execute(id));
    return results;
  }
}
