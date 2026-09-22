/**
 * PruneRetainedDataUseCase
 *
 * Deletes history past the retention window, at most once per interval.
 *
 * Every log-shaped table Shep writes grew without bound: the operation log had
 * a `pruneBefore()` that nothing called, and the activity log, agent and
 * interactive messages, phase timings and PM notifications had no retention at
 * all — about 184 MB a year at five agents a day.
 *
 * It runs on every process start, because the daemon may never have been
 * started and a CLI invocation may be the only process that runs all week —
 * and, while one is up, on a timer in the long-running daemon / `shep ui`
 * process (RetentionScheduler), since one that is never restarted would
 * otherwise never prune (spec 116). The interval claim is what makes both
 * affordable — a due check is one indexed point read, and the prune itself
 * happens once a day no matter how many processes ask.
 *
 * Worker log files (`~/.shep/logs/worker-*.log`) follow the same window, via
 * `PruneLogsUseCase` — which never touches the log of a still-active run.
 */

import { injectable, inject } from 'tsyringe';
import type { IRetentionRepository } from '../../ports/output/repositories/retention.repository.interface.js';
import type { RetentionPruneCounts } from '../../ports/output/repositories/retention.repository.interface.js';
import type { IOperationLogRepository } from '../../ports/output/repositories/operation-log.repository.interface.js';
import {
  DEFAULT_DATA_RETENTION_DAYS,
  DATA_RETENTION_PRUNE_INTERVAL_MS,
  retentionCutoff,
} from '../../../domain/shared/data-retention.js';
import { PruneLogsUseCase } from '../logs/prune-logs.use-case.js';

/** Unit suffix `PruneLogsUseCase` parses for a window given in days. */
const DAYS_DURATION_SUFFIX = 'd';

export interface PruneRetainedDataResult {
  /** False when another process already pruned inside the interval. */
  pruned: boolean;
  /** The cutoff applied, present only when `pruned`. */
  cutoff?: Date;
  /** Rows removed per table, present only when `pruned`. */
  counts?: RetentionPruneCounts & { operationLog: number; workerLogFiles: number };
}

export interface PruneRetainedDataOptions {
  /** Prune regardless of when the last one ran. */
  force?: boolean;
  /** Override the retention window, in days. */
  retentionDays?: number;
  /** Current time; injectable so the interval is testable without waiting. */
  now?: Date;
}

@injectable()
export class PruneRetainedDataUseCase {
  constructor(
    @inject('IRetentionRepository')
    private readonly retentionRepo: IRetentionRepository,
    @inject('IOperationLogRepository')
    private readonly operationLogRepo: IOperationLogRepository,
    @inject(PruneLogsUseCase)
    private readonly pruneLogs: Pick<PruneLogsUseCase, 'execute'>
  ) {}

  async execute(options?: PruneRetainedDataOptions): Promise<PruneRetainedDataResult> {
    const now = options?.now ?? new Date();
    const retentionDays = options?.retentionDays ?? DEFAULT_DATA_RETENTION_DAYS;

    if (options?.force !== true) {
      const claimed = await this.retentionRepo.claimPruneCycle(
        now,
        DATA_RETENTION_PRUNE_INTERVAL_MS
      );
      if (!claimed) {
        return { pruned: false };
      }
    }

    const cutoff = retentionCutoff(now, retentionDays);
    const counts = await this.retentionRepo.pruneOlderThan(cutoff);
    // The operation log keeps its own port: `pruneBefore` was already the
    // right method, it simply had no caller.
    const operationLog = await this.operationLogRepo.pruneBefore(cutoff.getTime());
    const logs = await this.pruneLogs.execute({
      olderThan: `${retentionDays}${DAYS_DURATION_SUFFIX}`,
      dryRun: false,
      now,
    });

    return {
      pruned: true,
      cutoff,
      counts: { ...counts, operationLog, workerLogFiles: logs.deleted.length },
    };
  }
}
