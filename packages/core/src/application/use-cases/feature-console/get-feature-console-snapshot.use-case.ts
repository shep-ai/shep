/**
 * Get Feature Console Snapshot Use Case (spec 142)
 *
 * Everything the terminal feature console shows, from five batched reads:
 * features (with crashed runs reconciled first), their current runs, those
 * runs' phase timings, pending agent questions, and registered repositories.
 *
 * The fleet's own state — a parked admission queue, a tripped breaker — comes
 * from `GetFleetOverviewUseCase` (spec 148), so the console and `shep fleet
 * status` cannot disagree about the same fleet at the same moment.
 *
 * Each row arrives decided: state, phase, cost, elapsed time, whether it needs
 * the user, which actions it offers, and its place in the order.
 */

import { inject, injectable } from 'tsyringe';
import { AgentQuestionStatus, FeatureState } from '../../../domain/generated/output.js';
import type {
  AgentRun,
  Feature,
  FleetOverview,
  PhaseTiming,
} from '../../../domain/generated/output.js';
import {
  availableFeatureActions,
  compareConsoleRows,
  deriveFeatureState,
  featurePhaseOf,
  needsUserAttention,
} from '../../../domain/shared/feature-state.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';
import { isGateQuestion } from '../../../domain/shared/decision-builders.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import type { FeatureListFilters } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import { ListFeaturesUseCase } from '../features/list-features.use-case.js';
import { ListAgentQuestionInboxUseCase } from '../agents/list-agent-question-inbox.use-case.js';
import { GetFleetOverviewUseCase } from '../fleet/get-fleet-overview.use-case.js';
import {
  FEATURE_SHORT_ID_LENGTH,
  type FeatureConsoleFleet,
  type FeatureConsoleRow,
  type FeatureConsoleSnapshot,
  type FeatureConsoleSummary,
  type GetFeatureConsoleSnapshotInput,
} from './feature-console.types.js';

const WAITING_STATES: ReadonlySet<FeatureState> = new Set([
  FeatureState.Queued,
  FeatureState.Blocked,
  FeatureState.Pending,
]);

@injectable()
export class GetFeatureConsoleSnapshotUseCase {
  constructor(
    @inject(ListFeaturesUseCase)
    private readonly listFeatures: ListFeaturesUseCase,
    @inject('IAgentRunRepository')
    private readonly runRepo: IAgentRunRepository,
    @inject('IPhaseTimingRepository')
    private readonly timingRepo: IPhaseTimingRepository,
    @inject(ListAgentQuestionInboxUseCase)
    private readonly questionInbox: ListAgentQuestionInboxUseCase,
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository,
    @inject('IClock')
    private readonly clock: IClock,
    @inject(GetFleetOverviewUseCase)
    private readonly fleetOverview: GetFleetOverviewUseCase
  ) {}

  async execute(input: GetFeatureConsoleSnapshotInput = {}): Promise<FeatureConsoleSnapshot> {
    const now = this.clock.now();
    const features = await this.listFeatures.execute(listFilters(input));

    const runIds = features.flatMap((f) => (f.agentRunId ? [f.agentRunId] : []));
    const [runs, timings, questions, repositories, fleet] = await Promise.all([
      runIds.length > 0 ? this.runRepo.findByIds(runIds) : Promise.resolve([]),
      runIds.length > 0 ? this.timingRepo.findByRunIds(runIds) : Promise.resolve([]),
      this.questionInbox.execute({ status: AgentQuestionStatus.pending }),
      this.repositoryRepo.list(),
      // Scoped exactly like the features above, so `shep tui --repo` judges one
      // repository the way `shep fleet status --repo` does. A scoped read never
      // parks the global queue; the overview use case owns that guard.
      this.fleetOverview.execute(input.repositoryPath),
    ]);

    const runById = new Map(runs.map((r) => [r.id, r]));
    const timingsByRun = groupBy(timings, (t) => t.agentRunId);
    // A gate files an inbox question mirroring itself; the run status already
    // says "at a gate", so only the agent's own questions count here.
    const questionsByFeature = countBy(
      questions.filter((q) => !isGateQuestion(q)),
      (q) => q.featureId
    );
    const repoNameByPath = new Map(
      repositories.map((r) => [normalizeRepositoryPath(r.path), r.name])
    );

    const rows = features
      .map((feature) => {
        const run = feature.agentRunId ? runById.get(feature.agentRunId) : undefined;
        return buildRow({
          feature,
          run,
          timings: run ? (timingsByRun.get(run.id) ?? []) : [],
          pendingQuestions: questionsByFeature.get(feature.id) ?? 0,
          repositoryName:
            repoNameByPath.get(normalizeRepositoryPath(feature.repositoryPath)) ??
            lastPathSegment(feature.repositoryPath),
          now,
        });
      })
      .sort(compareConsoleRows);

    return { generatedAt: now, rows, summary: summarize(rows), fleet: toFleet(fleet) };
  }
}

/**
 * The two fleet facts the console shows, and nothing else.
 *
 * `FleetOverview` carries the counts too, but the console counts its own rows —
 * copying them would create a second number that could disagree with the
 * roster. `pausedAt` arrives as the generated `utcDateTime` (typed `any`); it is
 * normalised here so the banner's age arithmetic is checked.
 */
function toFleet(overview: FleetOverview): FeatureConsoleFleet {
  return {
    ...(overview.queuePaused
      ? {
          queuePause: {
            pausedAt: new Date(overview.queuePaused.pausedAt),
            reason: overview.queuePaused.reason,
          },
        }
      : {}),
    circuitBreakerTripped: overview.circuitBreakerTripped ?? false,
    ...(overview.circuitBreakerReason
      ? { circuitBreakerReason: overview.circuitBreakerReason }
      : {}),
  };
}

function listFilters(input: GetFeatureConsoleSnapshotInput): FeatureListFilters | undefined {
  const filters: FeatureListFilters = {};
  if (input.repositoryPath) filters.repositoryPath = input.repositoryPath;
  if (input.includeArchived) filters.includeArchived = true;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

interface RowInput {
  feature: Feature;
  run: AgentRun | undefined;
  timings: PhaseTiming[];
  pendingQuestions: number;
  repositoryName: string;
  now: Date;
}

function buildRow({
  feature,
  run,
  timings,
  pendingQuestions,
  repositoryName,
  now,
}: RowInput): FeatureConsoleRow {
  const state = deriveFeatureState(feature, run);
  const usage = sumUsage(timings);
  return {
    featureId: feature.id,
    shortId: feature.id.slice(0, FEATURE_SHORT_ID_LENGTH),
    name: feature.name,
    repositoryName,
    repositoryPath: feature.repositoryPath,
    branch: feature.branch,
    ...(feature.worktreePath ? { worktreePath: feature.worktreePath } : {}),
    lifecycle: feature.lifecycle,
    state,
    phase: featurePhaseOf(feature, run),
    ...(run
      ? {
          agentType: run.agentType,
          runId: run.id,
          runStatus: run.status,
          ...(run.modelId ? { modelId: run.modelId } : {}),
          ...(run.error ? { error: run.error } : {}),
        }
      : {}),
    elapsedMs: elapsedOf(run, timings, now),
    ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    pendingQuestions,
    needsAttention: needsUserAttention(state, pendingQuestions),
    actions: availableFeatureActions(run),
    ...(feature.pr
      ? {
          pr: {
            number: feature.pr.number,
            url: feature.pr.url,
            status: feature.pr.status,
            ...(feature.pr.ciStatus ? { ciStatus: feature.pr.ciStatus } : {}),
          },
        }
      : {}),
    updatedAt: toDate(feature.updatedAt) ?? now,
  };
}

/**
 * Active time of the run. Phase timings are the truth when they exist: a
 * finished phase counts its duration, an open one counts up to now — or up to
 * the moment it parked at a gate, so a feature waiting on the user does not
 * keep accruing time. Without timings, the run's own start and end.
 */
function elapsedOf(run: AgentRun | undefined, timings: PhaseTiming[], now: Date): number {
  if (timings.length > 0) {
    return timings.reduce((sum, t) => sum + phaseDurationMs(t, now), 0);
  }
  const started = toDate(run?.startedAt);
  if (!run || !started) return 0;
  const ended = toDate(run.completedAt) ?? now;
  return Math.max(0, ended.getTime() - started.getTime());
}

function phaseDurationMs(timing: PhaseTiming, now: Date): number {
  if (timing.durationMs !== undefined && timing.durationMs !== null) {
    return Number(timing.durationMs);
  }
  const started = toDate(timing.startedAt);
  if (!started) return 0;
  const ended = toDate(timing.completedAt) ?? toDate(timing.waitingApprovalAt) ?? now;
  return Math.max(0, ended.getTime() - started.getTime());
}

function sumUsage(timings: PhaseTiming[]): {
  costUsd?: number;
  inputTokens: number;
  outputTokens: number;
} {
  let costUsd: number | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const t of timings) {
    if (t.costUsd !== undefined && t.costUsd !== null) costUsd = (costUsd ?? 0) + t.costUsd;
    inputTokens += Number(t.inputTokens ?? 0);
    outputTokens += Number(t.outputTokens ?? 0);
  }
  return { ...(costUsd !== undefined ? { costUsd } : {}), inputTokens, outputTokens };
}

function summarize(rows: FeatureConsoleRow[]): FeatureConsoleSummary {
  const count = (predicate: (row: FeatureConsoleRow) => boolean) => rows.filter(predicate).length;
  return {
    total: rows.length,
    needsAttention: count((r) => r.needsAttention),
    running: count((r) => r.state === FeatureState.Running),
    waiting: count((r) => WAITING_STATES.has(r.state)),
    failed: count((r) => r.state === FeatureState.Error),
    done: count((r) => r.state === FeatureState.Done),
  };
}

function lastPathSegment(path: string): string {
  const segments = normalizeRepositoryPath(path).split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function toDate(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function countBy<T>(
  items: readonly T[],
  key: (item: T) => string | undefined
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== undefined) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
