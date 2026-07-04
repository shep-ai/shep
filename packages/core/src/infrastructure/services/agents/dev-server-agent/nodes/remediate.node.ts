/**
 * remediate node — agent-driven fix of the last start/verify failure.
 *
 * Always returns the incremented `remediationAttempts` (last-write-wins
 * channel — the routing budget). With no executor available the node
 * degrades: `failureReason` is deliberately left untouched so the route
 * after ensure_infra terminates the run. With an executor it first
 * invalidates the cached run plan (the plan may be the cause — the next
 * start re-analyzes), then runs the remediation agent; on success it
 * EXPLICITLY writes `failureReason: null` (the reducer lets an explicit
 * null overwrite) so the graph loops back and retries, and clears
 * `lastErrorTail`. An executor throw keeps the failure set — terminal.
 */

import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { DevServerAgentNodeFn } from '../types.js';
import { buildRemediationPrompt } from './prompts/remediation.prompt.js';

/** Default bound for a single remediation agent run. */
export const DEFAULT_REMEDIATION_TIMEOUT_MS = 300_000;

/** Dependencies for the remediate node. */
export interface RemediateNodeDeps {
  /** Remediation agent, or null when no agent is configured (degraded). */
  executor: IAgentExecutor | null;
  /** Run-plan cache — invalidated so the next start re-analyzes. */
  runPlanRepository: Pick<IDevServerRunPlanRepository, 'deleteByRepoPath'>;
  /** Agent run bound; defaults to {@link DEFAULT_REMEDIATION_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Live log sink (SSE trail). */
  log: (l: string) => void;
}

/** Build the remediate node from injected dependencies. */
export const createRemediateNode =
  (deps: RemediateNodeDeps): DevServerAgentNodeFn =>
  async (state) => {
    const remediationAttempts = state.remediationAttempts + 1;

    if (deps.executor === null) {
      // Keep failureReason untouched (channel omitted) — the graph
      // terminates the run after the ensure_infra hop.
      deps.log('no agent available for remediation');
      return { remediationAttempts, degraded: true };
    }

    // Invalidate the cached plan — it may be the cause of the failure, so
    // the next start must re-analyze. Best-effort: a cache miss must never
    // block remediation itself.
    try {
      await deps.runPlanRepository.deleteByRepoPath(state.targetPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log(`failed to invalidate cached run plan: ${message}`);
    }

    const prompt = buildRemediationPrompt({
      command: state.runPlan?.command ?? null,
      cwd: state.runPlan?.cwd ?? state.targetPath,
      failureReason: state.failureReason,
      errorTail: state.lastErrorTail,
      attempt: remediationAttempts,
    });

    deps.log(`remediation attempt ${remediationAttempts}: launching agent`);
    try {
      await deps.executor.execute(prompt, {
        cwd: state.targetPath,
        timeout: deps.timeoutMs ?? DEFAULT_REMEDIATION_TIMEOUT_MS,
        silent: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Keep failureReason set — the run terminates after ensure_infra.
      deps.log(`remediation agent failed: ${message}`);
      return { remediationAttempts };
    }

    deps.log(`remediation attempt ${remediationAttempts} completed — retrying start`);
    // Explicit null overwrites the previous failure (reducer contract) so
    // the graph loops back through ensure_infra and retries the start.
    return { remediationAttempts, failureReason: null, lastErrorTail: [] };
  };
