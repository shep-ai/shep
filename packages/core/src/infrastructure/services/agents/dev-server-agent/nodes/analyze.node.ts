/**
 * Analyze Node (dev-server agent)
 *
 * Resolves a DevServerRunPlan for the target repository via an ordered tier
 * chain, cheapest and most authoritative first:
 *
 * 0. Repo config — a committed `.shep/dev.json`. Read on EVERY start, ahead
 *              of the cache, so an edit to the file takes effect immediately
 *              and the file itself can never go stale. The row it upserts is
 *              a projection of the file, not a cache of it.
 * 1. Cache   — a persisted plan whose configHash still matches the repo's
 *              current manifest fingerprint is reused as-is. A Manual plan
 *              is reused REGARDLESS of drift: it is the user's instruction,
 *              and staleness is reported rather than acted on (FR-15).
 * 2. Detect  — the ordered ecosystem detector registry (Node, Deno, Make,
 *              Python, Go, Rust, Ruby, Elixir, Compose) persists a
 *              Deterministic plan with zero agent involvement.
 * 3. Agent   — a structured agent call analyzes the repository (any
 *              language/stack no detector covers) and persists an Agent plan.
 *
 * Expected failures (not deployable, no command, analysis error, degraded
 * mode with every detector exhausted) NEVER throw — they surface as
 * failureReason so the graph can route/terminate cleanly. Every tier appends
 * to `capturedLogs` through the same emit closure, so the SSE trail explains
 * which tier won and why (NFR-11).
 */

import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import type { DevServerRunPlan } from '@/domain/generated/output.js';
import type {
  detectRunPlan,
  DetectionOutcome,
} from '@/infrastructure/services/deployment/detect-dev-script.js';
import { Ecosystem } from '@/infrastructure/services/deployment/detectors/registry.js';
import type { readRepoDevConfig } from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import { REPO_DEV_CONFIG_PATH } from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import type { DevServerAgentNodeFn, DevServerAgentNodeResult } from '../types.js';
import { isManualPlan } from '../manual-plan.js';
import {
  RUN_PLAN_ANALYSIS_SCHEMA,
  type DevServerAnalysis,
} from '../schemas/run-plan-analysis.schema.js';
import { buildAnalysisPrompt } from './prompts/analysis.prompt.js';
import {
  buildAgentPlan,
  buildDeterministicPlan,
  buildRepoConfigPlan,
} from './analyze-plan-builders.js';

/** Max agent turns for the structured analysis call. */
const ANALYSIS_MAX_TURNS = 3;

/** Dependencies injected into the analyze node factory. */
export interface AnalyzeNodeDeps {
  runPlanRepository: IDevServerRunPlanRepository;
  /** Ordered detector registry walk, carrying the winning detector's identity. */
  detect: typeof detectRunPlan;
  /** Tier-zero reader for the repository's committed `.shep/dev.json`. */
  readRepoConfig: typeof readRepoDevConfig;
  /** null = degraded (no agent configured) — deterministic-only operation. */
  structuredCaller: Pick<IStructuredAgentCaller, 'call'> | null;
  computeConfigHash: (dir: string) => string;
  /** Bridges DeploymentState.Analyzing to the deployment service (wired in task-11). */
  reportAnalyzing: () => void;
  /** Bridges progress lines to SSE deployment logs. */
  log: (line: string) => void;
}

/** Create the analyze node: repo config → cache → detector registry → agent. */
export const createAnalyzeNode = (deps: AnalyzeNodeDeps): DevServerAgentNodeFn => {
  return async (state) => {
    const capturedLogs: string[] = [];
    const emit = (line: string): void => {
      capturedLogs.push(line);
      deps.log(line);
    };
    const done = (update: DevServerAgentNodeResult): DevServerAgentNodeResult => ({
      ...update,
      capturedLogs,
    });

    deps.reportAnalyzing();
    emit(`Analyzing dev environment for ${state.targetPath}`);

    const degraded = deps.structuredCaller === null;
    const configHash = deps.computeConfigHash(state.targetPath);
    const existing = await deps.runPlanRepository.findByRepoPath(state.targetPath);

    // Tier 0: a committed `.shep/dev.json` outranks everything, including a
    // fresh cached plan — otherwise a team-wide committed override could be
    // shadowed by one teammate's stale local one, with nothing on screen
    // saying why.
    const fromRepoConfig = readRepoConfigPlan(deps, state.targetPath, configHash, existing);
    if (fromRepoConfig) {
      await deps.runPlanRepository.upsert(fromRepoConfig);
      emit(
        `Run plan tier: repo config — ${REPO_DEV_CONFIG_PATH} declares ` +
          `${fromRepoConfig.command} (in ${fromRepoConfig.cwd})`
      );
      return done({ runPlan: fromRepoConfig, degraded });
    }

    // Tier 1: persisted plan — pinned plans always, others while current
    if (existing) {
      if (isManualPlan(existing)) {
        emit(pinnedPlanNotice(existing, configHash));
        return done({ runPlan: existing, degraded });
      }
      if (existing.configHash === configHash) {
        emit(`run plan cache hit — reusing ${existing.source} plan: ${existing.command}`);
        return done({ runPlan: existing, degraded });
      }
      emit('Cached run plan is stale (config files changed) — re-analyzing');
    }

    // Tier 2: the ordered ecosystem detector registry
    const outcome = detectSafely(deps, state.targetPath);
    if (outcome.result.success) {
      const runPlan = buildDeterministicPlan(
        outcome.result,
        state.targetPath,
        configHash,
        new Date()
      );
      await deps.runPlanRepository.upsert(runPlan);
      emit(deterministicTierNotice(outcome, runPlan));
      return done({ runPlan, degraded });
    }

    // Every detector fell through — only now is an agent the cheapest option.
    const detectionError = outcome.result.error;

    // Tier 3: structured agent analysis (any language/stack)
    if (deps.structuredCaller) {
      emit(`No detector matched (${detectionError}) — analyzing with AI agent`);
      return done(
        await analyzeWithAgent(deps.structuredCaller, deps.runPlanRepository, {
          targetPath: state.targetPath,
          configHash,
          emit,
        })
      );
    }

    // Degraded (no agent) AND every detector exhausted — actionable terminal
    // failure. Note this now fires ONLY on full detector exhaustion: every
    // ecosystem the registry covers starts fine with no agent at all (FR-10).
    const failureReason =
      `Could not detect a dev server (${detectionError}) and no AI agent is ` +
      `configured to analyze the repository. Configure an agent in Settings or ` +
      `add a dev/start/serve script to package.json.`;
    emit(failureReason);
    return done({ degraded: true, failureReason });
  };
};

/**
 * Read tier zero, degrading to "nothing declared" on any failure.
 *
 * The reader already validates field by field and returns null on any doubt;
 * the try/catch covers the truly unexpected (a filesystem that throws on
 * stat, a symlink loop) so an untrusted committed file can never crash the
 * graph (NFR-4).
 */
function readRepoConfigPlan(
  deps: AnalyzeNodeDeps,
  targetPath: string,
  configHash: string,
  existing: DevServerRunPlan | null
): DevServerRunPlan | null {
  let config: ReturnType<typeof readRepoDevConfig>;
  try {
    config = deps.readRepoConfig(targetPath);
  } catch {
    return null;
  }

  return config === null
    ? null
    : buildRepoConfigPlan(config, targetPath, configHash, existing, new Date());
}

/**
 * Walk the detector registry, converting an unexpected throw into an
 * ordinary fall-through. Detectors are contractually non-throwing, but this
 * node's own contract ("expected failures never throw") must not depend on
 * ten other modules keeping theirs.
 */
function detectSafely(deps: AnalyzeNodeDeps, targetPath: string): DetectionOutcome {
  try {
    return deps.detect(targetPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ecosystem: Ecosystem.Node,
      result: { success: false, error: `Detection failed unexpectedly: ${message}` },
    };
  }
}

/** One line naming the winning detector and what it produced (NFR-11). */
function deterministicTierNotice(outcome: DetectionOutcome, runPlan: DevServerRunPlan): string {
  const detection = outcome.result;
  const runtime = detection.success && detection.runtime ? ` via ${detection.runtime}` : '';
  return (
    `Run plan tier: deterministic — the "${outcome.ecosystem}" detector matched ` +
    `${runPlan.cwd}${runtime}: ${runPlan.command}`
  );
}

/**
 * Notice for a reused pinned plan. Drift is REPORTED, never acted on: an
 * override that the heuristics can overrule is not an override, so the user
 * is told the repo moved and pointed at re-analysis instead of losing what
 * they typed.
 */
function pinnedPlanNotice(plan: DevServerRunPlan, configHash: string): string {
  const staleness =
    plan.configHash === configHash
      ? ''
      : ' (config files have changed since it was set — re-analyze to pick them up)';
  return `Using your pinned run plan: ${plan.command} (in ${plan.cwd})${staleness}`;
}

/** Context shared by the agent-analysis helpers. */
interface AgentAnalysisContext {
  targetPath: string;
  configHash: string;
  emit: (line: string) => void;
}

/** Run the structured analysis call and shape the result into a node update. */
async function analyzeWithAgent(
  structuredCaller: Pick<IStructuredAgentCaller, 'call'>,
  runPlanRepository: IDevServerRunPlanRepository,
  ctx: AgentAnalysisContext
): Promise<DevServerAgentNodeResult> {
  const { targetPath, configHash, emit } = ctx;

  let analysis: DevServerAnalysis;
  try {
    analysis = await structuredCaller.call<DevServerAnalysis>(
      buildAnalysisPrompt(targetPath),
      RUN_PLAN_ANALYSIS_SCHEMA,
      { silent: true, maxTurns: ANALYSIS_MAX_TURNS, cwd: targetPath }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureReason = `Dev environment analysis failed: ${message}`;
    emit(failureReason);
    return { failureReason };
  }

  if (!analysis.deployable) {
    emit(`Repository is not deployable: ${analysis.reason}`);
    return { failureReason: analysis.reason };
  }

  if (!analysis.command) {
    const failureReason = `Analysis found no runnable dev command: ${analysis.reason}`;
    emit(failureReason);
    return { failureReason };
  }

  const runPlan = buildAgentPlan(analysis, analysis.command, targetPath, configHash, new Date());
  await runPlanRepository.upsert(runPlan);
  emit(`Run plan tier: agent — analysis produced ${runPlan.command} (in ${runPlan.cwd})`);
  return { runPlan };
}
