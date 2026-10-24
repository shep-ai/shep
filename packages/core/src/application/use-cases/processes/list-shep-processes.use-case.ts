/**
 * List Shep Processes Use Case (spec 144)
 *
 * The rows `shep ps` shows: the web daemon (daemon.json) and every agent run
 * with a recorded PID, joined to its feature, with liveness, uptime, and CPU
 * and memory from ONE stats sample. Runs whose process exited on purpose
 * (finished, or paused at a gate) are listed only with `includeAll`.
 */

import { inject, injectable } from 'tsyringe';
import { ShepProcessKind, ShepProcessState } from '../../../domain/generated/output.js';
import type { AgentRun, Feature } from '../../../domain/generated/output.js';
import {
  compareShepProcesses,
  expectsLiveProcess,
  shepProcessState,
} from '../../../domain/shared/shep-process.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import type {
  DaemonState,
  IDaemonService,
} from '../../ports/output/services/daemon-service.interface.js';
import type { IProcessLivenessProbe } from '../../ports/output/services/process-liveness.interface.js';
import type { IProcessStatsProbe } from '../../ports/output/services/process-stats-probe.interface.js';
import { ListAgentRunsUseCase } from '../agents/list-agent-runs.use-case.js';
import { FEATURE_SHORT_ID_LENGTH } from '../feature-console/feature-console.types.js';
import { GetWorkerLogPathUseCase } from '../logs/get-worker-log-path.use-case.js';
import type {
  ListShepProcessesInput,
  ShepProcessList,
  ShepProcessRow,
} from './shep-process.types.js';

const DAEMON_HOST = 'http://localhost';

/** A recorded process before its state is settled by liveness and the stats sample. */
interface Candidate {
  row: Omit<ShepProcessRow, 'state'>;
  alive: boolean;
  expectedAlive: boolean;
}

@injectable()
export class ListShepProcessesUseCase {
  constructor(
    @inject('IDaemonService')
    private readonly daemon: Pick<IDaemonService, 'read'>,
    @inject(ListAgentRunsUseCase)
    private readonly listRuns: Pick<ListAgentRunsUseCase, 'execute'>,
    @inject('IFeatureRepository')
    private readonly features: Pick<IFeatureRepository, 'list'>,
    @inject('IProcessLivenessProbe')
    private readonly liveness: IProcessLivenessProbe,
    @inject('IProcessStatsProbe')
    private readonly stats: IProcessStatsProbe,
    @inject(GetWorkerLogPathUseCase)
    private readonly logPath: Pick<GetWorkerLogPathUseCase, 'execute'>,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(input: ListShepProcessesInput = {}): Promise<ShepProcessList> {
    const now = this.clock.now();
    const [daemonState, runs, features] = await Promise.all([
      this.daemon.read(),
      this.listRuns.execute(),
      this.features.list({ includeArchived: true }),
    ]);
    const featureById = new Map(features.map((f) => [f.id, f]));

    const candidates: Candidate[] = [
      ...(daemonState ? [this.daemonCandidate(daemonState)] : []),
      ...runs.flatMap((run) => (run.pid ? [this.runCandidate(run, run.pid, featureById)] : [])),
    ];

    const alivePids = candidates.filter((c) => c.alive).map((c) => c.row.pid);
    const sampled = alivePids.length > 0 ? await this.stats.sample(alivePids) : new Map();

    const processes = candidates
      .map(({ row, alive, expectedAlive }): ShepProcessRow => {
        const usage = sampled.get(row.pid);
        // A zombie answers kill(pid, 0) but has exited: it is not running.
        const state = shepProcessState(alive && usage?.zombie !== true, expectedAlive);
        if (state !== ShepProcessState.Running) return { ...row, state };
        return {
          ...row,
          state,
          ...(usage && { cpuPercent: usage.cpuPercent, rssBytes: usage.rssBytes }),
          ...(row.startedAt && { uptimeMs: Math.max(0, now.getTime() - row.startedAt.getTime()) }),
        };
      })
      .filter((row) => input.includeAll === true || row.state !== ShepProcessState.Exited)
      .sort(compareShepProcesses);

    return {
      generatedAt: now,
      processes,
      summary: {
        running: count(processes, ShepProcessState.Running),
        crashed: count(processes, ShepProcessState.Crashed),
        exited: count(processes, ShepProcessState.Exited),
      },
    };
  }

  private daemonCandidate(state: DaemonState): Candidate {
    return {
      row: {
        kind: ShepProcessKind.Daemon,
        pid: state.pid,
        startedAt: new Date(state.startedAt),
        url: `${DAEMON_HOST}:${state.port}`,
      },
      alive: this.liveness.isProcessAlive(state.pid),
      // daemon.json exists only while the daemon should be serving.
      expectedAlive: true,
    };
  }

  private runCandidate(run: AgentRun, pid: number, featureById: Map<string, Feature>): Candidate {
    return {
      row: this.runRow(run, pid, featureById),
      alive: this.liveness.isProcessAlive(pid),
      expectedAlive: expectsLiveProcess(run.status),
    };
  }

  private runRow(
    run: AgentRun,
    pid: number,
    featureById: Map<string, Feature>
  ): Omit<ShepProcessRow, 'state'> {
    const feature = run.featureId ? featureById.get(run.featureId) : undefined;
    const startedAt = run.startedAt ?? run.createdAt;
    return {
      kind: run.featureId ? ShepProcessKind.FeatureAgent : ShepProcessKind.AgentRun,
      pid,
      ...(startedAt && { startedAt: new Date(startedAt) }),
      runId: run.id,
      runShortId: run.id.slice(0, FEATURE_SHORT_ID_LENGTH),
      runStatus: run.status,
      agentType: run.agentType,
      agentName: run.agentName,
      ...(run.featureId && {
        featureId: run.featureId,
        featureShortId: run.featureId.slice(0, FEATURE_SHORT_ID_LENGTH),
        logPath: this.logPath.execute(run.id),
      }),
      ...(feature && { featureName: feature.name }),
    };
  }
}

function count(rows: readonly ShepProcessRow[], state: ShepProcessState): number {
  return rows.filter((r) => r.state === state).length;
}
