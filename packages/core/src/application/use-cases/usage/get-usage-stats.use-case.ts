/**
 * GetUsageStatsUseCase
 *
 * Aggregates `phase_timings` over a window: p50/p95 duration, token totals,
 * cost and failure rate, grouped by phase, agent, feature or model. All of
 * it was already persisted and nothing read it in aggregate — phase timings
 * surfaced only per feature in the web drawer, and `shep fleet status`
 * printed feature counts.
 *
 * COST HONESTY — the reason this class is careful rather than obvious:
 * `costUsd` is populated ONLY by the Claude executors. The shared AI-SDK
 * base (OpenRouter / Together / Ollama / LLMProxy) maps tokens and never
 * sets cost, so those phases have NO cost — which is not the same as a cost
 * of zero. Summing them as zero produces a total that is wrong by exactly
 * the amount nobody is measuring, and the web UI already presents such a
 * total as fact. So:
 *
 *   - a group where nothing reported cost gets `costUsd: null`, never `0`;
 *   - every group carries `phasesMissingCost` so partial coverage is visible;
 *   - the window total carries `costIsPartial` and the names of the agents
 *     that contributed no cost.
 */

import { inject, injectable } from 'tsyringe';

import { DURATION_SYNTAX_HINT, parseDurationMs } from '../../../domain/shared/parse-duration.js';
import {
  DEFAULT_USAGE_GROUP_BY,
  PHASE_EXIT_CODE_SUCCESS,
  UsageGroupBy,
  basePhaseName,
  isLifecyclePhase,
} from '../../../domain/shared/usage-grouping.js';
import type {
  IUsageStatsRepository,
  UsageSample,
} from '../../ports/output/repositories/usage-stats-repository.interface.js';

/** Window applied when the caller names none. */
export const DEFAULT_USAGE_WINDOW = '7d';

/** Label used when the grouping dimension is absent on a row. */
export const UNATTRIBUTED_GROUP_KEY = '(unattributed)';

/** Lifecycle phase recorded when a run starts (or resumes). */
const RUN_STARTED_PHASES = ['run:started', 'run:resumed'] as const;
/** Lifecycle phase recorded when a run fails. */
const RUN_FAILED_PHASE = 'run:failed';
/** Lifecycle phase recorded when a run completes cleanly. */
const RUN_COMPLETED_PHASE = 'run:completed';
/** Lifecycle phase recorded when a run is stopped by the operator. */
const RUN_STOPPED_PHASE = 'run:stopped';

/** Percentile ranks reported per group. */
const P50 = 0.5;
const P95 = 0.95;

export interface GetUsageStatsInput {
  /** Relative window, e.g. `7d`. Defaults to {@link DEFAULT_USAGE_WINDOW}. */
  since?: string;
  /** Grouping dimension. Defaults to {@link DEFAULT_USAGE_GROUP_BY}. */
  by?: UsageGroupBy;
  /** Injected clock for deterministic tests. */
  now?: Date;
}

export interface UsageGroupStats {
  /** Group label — the phase, agent, feature or model. */
  key: string;
  /** Phase executions in this group (lifecycle rows excluded). */
  phases: number;
  failures: number;
  /** `failures / phases`, or 0 for an empty group. */
  failureRate: number;
  durationP50Ms: number | null;
  durationP95Ms: number | null;
  totalDurationMs: number;
  totalApiDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  /** Summed cost, or `null` when NO phase in the group reported one. */
  costUsd: number | null;
  /** Whether at least one phase reported a cost. */
  costReported: boolean;
  /** Phases in this group with no cost recorded. */
  phasesMissingCost: number;
  numTurns: number;
}

export interface UsageTotals {
  phases: number;
  failures: number;
  failureRate: number;
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  /** Summed cost across every phase that reported one, or `null` if none did. */
  costUsd: number | null;
  /**
   * True when ANY phase in the window lacked cost data. When this is set,
   * `costUsd` is a floor, not a total, and must not be rendered as one.
   */
  costIsPartial: boolean;
  phasesMissingCost: number;
  /** Agent types that contributed phases with no cost data. */
  agentsMissingCost: string[];
}

/** Run-level outcomes, read from the zero-duration lifecycle rows. */
export interface UsageRunCounts {
  started: number;
  completed: number;
  failed: number;
  stopped: number;
}

export interface UsageStatsResult {
  since: Date;
  now: Date;
  windowMs: number;
  groupBy: UsageGroupBy;
  /** Phase executions in the window (lifecycle rows excluded). */
  totalPhases: number;
  groups: UsageGroupStats[];
  totals: UsageTotals;
  runs: UsageRunCounts;
}

@injectable()
export class GetUsageStatsUseCase {
  constructor(
    @inject('IUsageStatsRepository')
    private readonly repository: IUsageStatsRepository
  ) {}

  async execute(input: GetUsageStatsInput = {}): Promise<UsageStatsResult> {
    const requested = input.since ?? DEFAULT_USAGE_WINDOW;
    const windowMs = parseDurationMs(requested);
    if (windowMs === null) {
      throw new Error(`Invalid --since value "${requested}". ${DURATION_SYNTAX_HINT}`);
    }

    const now = input.now ?? new Date();
    const since = new Date(now.getTime() - windowMs);
    const groupBy = input.by ?? DEFAULT_USAGE_GROUP_BY;

    const samples = await this.repository.findSamplesSince(since);
    const lifecycle = samples.filter((s) => isLifecyclePhase(s.phase));
    const phases = samples.filter((s) => !isLifecyclePhase(s.phase));

    const groups = buildGroups(phases, groupBy);
    return {
      since,
      now,
      windowMs,
      groupBy,
      totalPhases: phases.length,
      groups,
      totals: buildTotals(phases),
      runs: countRuns(lifecycle),
    };
  }
}

function buildGroups(samples: UsageSample[], groupBy: UsageGroupBy): UsageGroupStats[] {
  const buckets = new Map<string, UsageSample[]>();
  for (const sample of samples) {
    const key = groupKeyFor(sample, groupBy);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [sample]);
    else bucket.push(sample);
  }

  const groups = [...buckets.entries()].map(([key, bucket]) => summarise(key, bucket));
  // Slowest first: the question this command answers is "what is eating the
  // day", and that is total wall-clock, not count.
  groups.sort((a, b) => b.totalDurationMs - a.totalDurationMs);
  return groups;
}

function groupKeyFor(sample: UsageSample, groupBy: UsageGroupBy): string {
  switch (groupBy) {
    case UsageGroupBy.Phase:
      return basePhaseName(sample.phase);
    case UsageGroupBy.Agent:
      return sample.agentType ?? UNATTRIBUTED_GROUP_KEY;
    case UsageGroupBy.Feature:
      return sample.featureName ?? sample.featureId ?? UNATTRIBUTED_GROUP_KEY;
    case UsageGroupBy.Model:
      return sample.modelId ?? UNATTRIBUTED_GROUP_KEY;
    default:
      return UNATTRIBUTED_GROUP_KEY;
  }
}

function summarise(key: string, samples: UsageSample[]): UsageGroupStats {
  const durations = samples
    .map((s) => s.durationMs)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  const withCost = samples.filter((s) => s.costUsd !== null);
  const inputTokens = sum(samples, (s) => s.inputTokens);
  const outputTokens = sum(samples, (s) => s.outputTokens);
  const cacheCreationInputTokens = sum(samples, (s) => s.cacheCreationInputTokens);
  const cacheReadInputTokens = sum(samples, (s) => s.cacheReadInputTokens);
  const failures = samples.filter(isFailure).length;

  return {
    key,
    phases: samples.length,
    failures,
    failureRate: samples.length === 0 ? 0 : failures / samples.length,
    durationP50Ms: percentile(durations, P50),
    durationP95Ms: percentile(durations, P95),
    totalDurationMs: sum(samples, (s) => s.durationMs),
    totalApiDurationMs: sum(samples, (s) => s.durationApiMs),
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens: totalTokensOf(inputTokens, outputTokens),
    // null, not 0 — see the class header.
    costUsd: withCost.length === 0 ? null : sum(withCost, (s) => s.costUsd),
    costReported: withCost.length > 0,
    phasesMissingCost: samples.length - withCost.length,
    numTurns: sum(samples, (s) => s.numTurns),
  };
}

function buildTotals(samples: UsageSample[]): UsageTotals {
  const withCost = samples.filter((s) => s.costUsd !== null);
  const missingCost = samples.filter((s) => s.costUsd === null);
  const inputTokens = sum(samples, (s) => s.inputTokens);
  const outputTokens = sum(samples, (s) => s.outputTokens);
  const cacheCreationInputTokens = sum(samples, (s) => s.cacheCreationInputTokens);
  const cacheReadInputTokens = sum(samples, (s) => s.cacheReadInputTokens);
  const failures = samples.filter(isFailure).length;

  return {
    phases: samples.length,
    failures,
    failureRate: samples.length === 0 ? 0 : failures / samples.length,
    totalDurationMs: sum(samples, (s) => s.durationMs),
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens: totalTokensOf(inputTokens, outputTokens),
    costUsd: withCost.length === 0 ? null : sum(withCost, (s) => s.costUsd),
    costIsPartial: missingCost.length > 0,
    phasesMissingCost: missingCost.length,
    agentsMissingCost: [...new Set(missingCost.map((s) => s.agentType ?? UNATTRIBUTED_GROUP_KEY))],
  };
}

/**
 * Total tokens for a bucket. `inputTokens` already INCLUDES the cache buckets:
 * the Claude executor adds cache_creation + cache_read to input_tokens, and the
 * AI SDK's inputTokens is the total with a cache breakdown beside it. The
 * cache fields are a breakdown of input, so adding them again double counts.
 */
function totalTokensOf(inputTokens: number, outputTokens: number): number {
  return inputTokens + outputTokens;
}

function countRuns(lifecycle: UsageSample[]): UsageRunCounts {
  const started = new Set<string>();
  const completed = new Set<string>();
  const failed = new Set<string>();
  const stopped = new Set<string>();

  for (const sample of lifecycle) {
    if ((RUN_STARTED_PHASES as readonly string[]).includes(sample.phase)) {
      started.add(sample.agentRunId);
    } else if (sample.phase === RUN_COMPLETED_PHASE) completed.add(sample.agentRunId);
    else if (sample.phase === RUN_FAILED_PHASE) failed.add(sample.agentRunId);
    else if (sample.phase === RUN_STOPPED_PHASE) stopped.add(sample.agentRunId);
  }

  return {
    started: started.size,
    completed: completed.size,
    failed: failed.size,
    stopped: stopped.size,
  };
}

/**
 * A phase failed when it recorded a non-success exit code or an error
 * message. A phase with neither — including one still running — is not a
 * failure; counting in-flight work as failed is how a dashboard invents a
 * problem.
 */
function isFailure(sample: UsageSample): boolean {
  if (sample.errorMessage !== null && sample.errorMessage.length > 0) return true;
  return sample.exitCode !== null && sample.exitCode !== PHASE_EXIT_CODE_SUCCESS;
}

/** Nearest-rank percentile over an ascending array. */
function percentile(ascending: readonly number[], rank: number): number | null {
  if (ascending.length === 0) return null;
  const index = Math.min(ascending.length - 1, Math.ceil(rank * ascending.length) - 1);
  return ascending[Math.max(0, index)] ?? null;
}

function sum(samples: readonly UsageSample[], pick: (s: UsageSample) => number | null): number {
  return samples.reduce((total, sample) => total + (pick(sample) ?? 0), 0);
}
