/**
 * PruneLogsUseCase
 *
 * Selects and (when confirmed) deletes worker logs older than a cutoff.
 * `~/.shep/logs/worker-*.log` files are large by design, since `[tool]`
 * lines carry full tool-input JSON and `[text]` lines full assistant prose.
 * Two callers: `shep logs prune`, and `PruneRetainedDataUseCase`, which
 * applies the data-retention window unattended (spec 116).
 *
 * Dry run is the DEFAULT. Deleting a run's log destroys the only record of
 * what that agent did, so the caller has to ask for it explicitly.
 *
 * The log of a run that is still active is never a candidate, however old:
 * a feature parked at an approval gate can leave its log untouched for weeks
 * and still resume into it (spec 116).
 */

import { inject, injectable } from 'tsyringe';

import { DURATION_SYNTAX_HINT, parseDurationMs } from '../../../domain/shared/parse-duration.js';
import { isActiveAgentRunStatus } from '../../../domain/shared/agent-run-status.js';
import { runIdOfWorkerLog } from '../../../domain/shared/worker-log.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type {
  ILogFileStore,
  LogFileInfo,
} from '../../ports/output/services/log-file-store.interface.js';

/** Applied when the caller names no age. Old enough that a live run is safe. */
export const DEFAULT_PRUNE_OLDER_THAN = '14d';

export interface PruneLogsInput {
  /** Relative age, e.g. `7d`. Defaults to {@link DEFAULT_PRUNE_OLDER_THAN}. */
  olderThan?: string;
  /** Delete for real when `false`. Defaults to `true` (dry run). */
  dryRun?: boolean;
  /** Injected clock for deterministic tests. */
  now?: Date;
}

/** A file that could not be deleted, and why. */
export interface PruneFailure {
  path: string;
  error: string;
}

export interface PruneLogsResult {
  logsDirectory: string;
  /** Cutoff that was applied, in milliseconds. */
  olderThanMs: number;
  dryRun: boolean;
  /** Every file in the directory. */
  totalFiles: number;
  totalBytes: number;
  /** Files older than the cutoff. */
  candidates: LogFileInfo[];
  /** Bytes the candidates occupy — what a real run would reclaim. */
  reclaimableBytes: number;
  /** Files actually deleted; empty on a dry run. */
  deleted: LogFileInfo[];
  /** Bytes actually reclaimed. */
  reclaimedBytes: number;
  failures: PruneFailure[];
}

@injectable()
export class PruneLogsUseCase {
  constructor(
    @inject('ILogFileStore')
    private readonly store: ILogFileStore,
    @inject('IAgentRunRepository')
    private readonly runs: IAgentRunRepository
  ) {}

  async execute(input: PruneLogsInput = {}): Promise<PruneLogsResult> {
    const requested = input.olderThan ?? DEFAULT_PRUNE_OLDER_THAN;
    const olderThanMs = parseDurationMs(requested);
    if (olderThanMs === null) {
      // Refuse rather than fall back to a default: a typo in `--older-than`
      // that silently became "everything" would delete every worker log.
      throw new Error(`Invalid --older-than value "${requested}". ${DURATION_SYNTAX_HINT}`);
    }

    const dryRun = input.dryRun !== false;
    const now = input.now ?? new Date();
    const cutoffMs = now.getTime() - olderThanMs;

    const files = await this.store.list();
    const activeRunIds = await this.activeRunIds();
    const candidates = files.filter((file) => {
      if (file.modifiedAt.getTime() > cutoffMs) return false;
      const runId = runIdOfWorkerLog(file.name);
      return runId === null || !activeRunIds.has(runId);
    });

    const result: PruneLogsResult = {
      logsDirectory: this.store.getLogsDirectory(),
      olderThanMs,
      dryRun,
      totalFiles: files.length,
      totalBytes: sumBytes(files),
      candidates,
      reclaimableBytes: sumBytes(candidates),
      deleted: [],
      reclaimedBytes: 0,
      failures: [],
    };

    if (dryRun) return result;

    for (const candidate of candidates) {
      try {
        await this.store.remove(candidate.path);
        result.deleted.push(candidate);
      } catch (err) {
        // One locked or vanished file must not abort the whole prune.
        result.failures.push({
          path: candidate.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    result.reclaimedBytes = sumBytes(result.deleted);
    return result;
  }

  private async activeRunIds(): Promise<Set<string>> {
    const runs = await this.runs.list();
    return new Set(runs.filter((run) => isActiveAgentRunStatus(run.status)).map((run) => run.id));
  }
}

function sumBytes(files: readonly LogFileInfo[]): number {
  return files.reduce((total, file) => total + file.sizeBytes, 0);
}
