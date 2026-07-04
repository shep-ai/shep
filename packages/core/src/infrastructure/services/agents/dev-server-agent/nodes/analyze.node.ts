/**
 * Analyze Node (dev-server agent)
 *
 * Resolves a DevServerRunPlan for the target repository via a three-tier
 * strategy, cheapest first:
 *
 * 1. Cache   — a persisted plan whose configHash still matches the repo's
 *              current manifest fingerprint is reused as-is.
 * 2. Detect  — deterministic package.json dev-script detection persists a
 *              Deterministic plan with zero agent involvement.
 * 3. Agent   — a structured agent call analyzes the repository (any
 *              language/stack) and persists an Agent plan.
 *
 * Expected failures (not deployable, no command, analysis error, degraded
 * mode with failed detection) NEVER throw — they surface as failureReason
 * so the graph can route/terminate cleanly.
 */

import { resolve } from 'node:path';
import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import { RunPlanSource, type DevServerRunPlan } from '@/domain/generated/output.js';
import type { detectDevScript } from '@/infrastructure/services/deployment/detect-dev-script.js';
import type { DevServerAgentNodeFn, DevServerAgentNodeResult } from '../types.js';
import {
  RUN_PLAN_ANALYSIS_SCHEMA,
  type DevServerAnalysis,
} from '../schemas/run-plan-analysis.schema.js';
import { buildAnalysisPrompt } from './prompts/analysis.prompt.js';

/** Max agent turns for the structured analysis call. */
const ANALYSIS_MAX_TURNS = 3;

/** Schema value the agent uses for "run in the repo root". */
const REPO_ROOT_CWD = '.';

/**
 * Package-manager extraction heuristic for Agent plans: the plan's
 * `packageManager` is only set when one of the analysis setupCommands is an
 * obvious Node package-manager install invocation — a command starting with
 * `npm|pnpm|yarn|bun` followed by `install` or `ci`. Anything else (pip,
 * bundle, cargo, bare `yarn`, …) leaves the field unset, because
 * `packageManager` drives the install/staleness pipeline which only knows
 * how to operate Node package managers.
 */
const PACKAGE_MANAGER_INSTALL_PATTERN = /^\s*(npm|pnpm|yarn|bun)\s+(install|ci)\b/;

/** Dependencies injected into the analyze node factory. */
export interface AnalyzeNodeDeps {
  runPlanRepository: IDevServerRunPlanRepository;
  detect: typeof detectDevScript;
  /** null = degraded (no agent configured) — deterministic-only operation. */
  structuredCaller: Pick<IStructuredAgentCaller, 'call'> | null;
  computeConfigHash: (dir: string) => string;
  /** Bridges DeploymentState.Analyzing to the deployment service (wired in task-11). */
  reportAnalyzing: () => void;
  /** Bridges progress lines to SSE deployment logs. */
  log: (line: string) => void;
}

/** Extract a Node package manager from setup commands (see heuristic above). */
function extractPackageManager(setupCommands: string[]): string | undefined {
  for (const command of setupCommands) {
    const match = PACKAGE_MANAGER_INSTALL_PATTERN.exec(command);
    if (match) return match[1];
  }
  return undefined;
}

/** Create the analyze node: cache → deterministic detection → structured agent. */
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

    // Tier 1: persisted plan whose config fingerprint is still current
    const cached = await deps.runPlanRepository.findByRepoPath(state.targetPath);
    if (cached) {
      if (cached.configHash === configHash) {
        emit(`run plan cache hit — reusing ${cached.source} plan: ${cached.command}`);
        return done({ runPlan: cached, degraded });
      }
      emit('Cached run plan is stale (config files changed) — re-analyzing');
    }

    // Tier 2: deterministic package.json dev-script detection
    const detection = deps.detect(state.targetPath);
    if (detection.success) {
      const now = new Date();
      const runPlan: DevServerRunPlan = {
        repoPath: state.targetPath,
        source: RunPlanSource.Deterministic,
        command: detection.command,
        cwd: detection.resolvedDir,
        packageManager: detection.packageManager,
        setupCommands: [],
        configHash,
        createdAt: now,
        updatedAt: now,
      };
      await deps.runPlanRepository.upsert(runPlan);
      emit(`Detected dev command deterministically: ${detection.command} (in ${runPlan.cwd})`);
      return done({ runPlan, degraded });
    }

    // Tier 3: structured agent analysis (any language/stack)
    if (deps.structuredCaller) {
      emit(`Deterministic detection failed (${detection.error}) — analyzing with AI agent`);
      return done(
        await analyzeWithAgent(deps.structuredCaller, deps.runPlanRepository, {
          targetPath: state.targetPath,
          configHash,
          emit,
        })
      );
    }

    // Degraded (no agent) AND detection failed — actionable terminal failure
    const failureReason =
      `Could not detect a dev server (${detection.error}) and no AI agent is ` +
      `configured to analyze the repository. Configure an agent in Settings or ` +
      `add a dev/start/serve script to package.json.`;
    emit(failureReason);
    return done({ degraded: true, failureReason });
  };
};

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

  const runPlan = buildAgentPlan(analysis, analysis.command, targetPath, configHash);
  await runPlanRepository.upsert(runPlan);
  emit(`Agent analysis produced run plan: ${runPlan.command} (in ${runPlan.cwd})`);
  return { runPlan };
}

/** Build an Agent-sourced run plan from a deployable analysis result. */
function buildAgentPlan(
  analysis: DevServerAnalysis,
  command: string,
  targetPath: string,
  configHash: string
): DevServerRunPlan {
  const now = new Date();
  const cwd = analysis.cwd === REPO_ROOT_CWD ? targetPath : resolve(targetPath, analysis.cwd);
  const packageManager = extractPackageManager(analysis.setupCommands);

  return {
    repoPath: targetPath,
    source: RunPlanSource.Agent,
    command,
    cwd,
    ...(packageManager !== undefined && { packageManager }),
    ...(analysis.expectedPort !== null && { expectedPort: analysis.expectedPort }),
    ...(analysis.language !== null && { language: analysis.language }),
    ...(analysis.framework !== null && { framework: analysis.framework }),
    setupCommands: analysis.setupCommands,
    configHash,
    createdAt: now,
    updatedAt: now,
  };
}
