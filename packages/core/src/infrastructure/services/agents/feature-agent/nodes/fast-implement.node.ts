/**
 * Fast-Implement Node
 *
 * Single-pass implementation node for fast mode. Builds a prompt from
 * the user's query plus lightweight codebase context, calls the executor
 * once, and returns. Does NOT handle commit/push/PR — that's the merge
 * node's job.
 *
 * Follows the same factory pattern as other nodes: takes executor
 * dependency, returns async (state) => Partial<FeatureAgentState>.
 */

import { execSync } from 'node:child_process';
import { isGraphBubbleUp } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { FeatureAgentState } from '../state.js';
import {
  createNodeLogger,
  buildExecutorOptions,
  retryExecute,
  getCompletedPhases,
  markPhaseComplete,
  applyMemorySelection,
  type MemorySelector,
} from './node-helpers.js';
import { reportNodeStart } from '../heartbeat.js';
import { recordPhaseStart, recordPhaseEnd } from '../phase-timing-context.js';
import { updateNodeLifecycle } from '../lifecycle-context.js';
import { buildFastImplementPrompt } from './prompts/fast-implement.prompt.js';
import { createEvidenceNode } from './evidence.node.js';

/**
 * Factory that creates the fast-implement node function.
 *
 * @param executor - The agent executor to use for implementation
 * @returns A LangGraph node function
 */
export function createFastImplementNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  const log = createNodeLogger('fast-implement');

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.activate();
    log.info('Starting fast implementation');
    reportNodeStart('fast-implement');
    await updateNodeLifecycle('fast-implement');

    // Skip if already completed (resume from error path)
    const completedPhases = getCompletedPhases(state.specDir);
    if (completedPhases.includes('fast-implement')) {
      log.info('Phase already completed, skipping execution');
      return {
        currentNode: 'fast-implement',
        messages: ['[fast-implement] already completed — skipping'],
        _needsReexecution: false,
      };
    }

    const startTime = Date.now();
    const stateForPrompt = await applyMemorySelection(state, 'fast-implement', selectMemory);
    const prompt = buildFastImplementPrompt(stateForPrompt);
    const timingId = await recordPhaseStart('fast-implement', {
      prompt,
      modelId: state.model,
      agentType: executor.agentType,
    });

    try {
      const options = buildExecutorOptions(state, undefined, 'fast-implement');

      log.info(`Executing agent at cwd=${options.cwd}`);
      log.info(`Prompt length: ${prompt.length} chars`);
      const result = await retryExecute(executor, prompt, options, { logger: log });
      const durationMs = Date.now() - startTime;
      const elapsed = (durationMs / 1000).toFixed(1);
      log.info(`Complete (${result.result.length} chars, ${elapsed}s)`);

      // Validate that the executor actually produced changes (uncommitted or committed)
      const cwd = state.worktreePath || state.repositoryPath;
      if (!hasWorktreeChanges(cwd) && !hasNewCommits(cwd)) {
        throw new Error(
          '[fast-implement] Agent produced no file changes — it may have entered plan mode or asked questions instead of implementing. Retrying.'
        );
      }

      // --- Evidence sub-agent: capture proof of completion (feature-gated) ---
      let evidence: FeatureAgentState['evidence'] = [];
      if (state.enableEvidence) {
        const evidenceNode = createEvidenceNode(executor);
        const evidenceResult = await evidenceNode(state);
        evidence = evidenceResult.evidence ?? [];
      } else {
        log.info('Evidence collection disabled — skipping');
      }

      await recordPhaseEnd(timingId, durationMs, {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        cacheCreationInputTokens: result.usage?.cacheCreationInputTokens,
        cacheReadInputTokens: result.usage?.cacheReadInputTokens,
        costUsd: result.usage?.costUsd,
        numTurns: result.usage?.numTurns,
        durationApiMs: result.usage?.durationApiMs,
        exitCode: 'success',
      });

      // Mark phase complete so resume from error skips re-execution
      markPhaseComplete(state.specDir, 'fast-implement', log);

      return {
        currentNode: 'fast-implement',
        evidence,
        messages: [
          `[fast-implement] Complete (${result.result.length} chars, ${elapsed}s)`,
          `[fast-implement] Evidence: ${evidence.length} record(s) captured`,
        ],
        _needsReexecution: false,
      };
    } catch (err: unknown) {
      if (isGraphBubbleUp(err)) throw err;

      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;
      const elapsed = (durationMs / 1000).toFixed(1);
      log.error(`${message} (after ${elapsed}s)`);

      await recordPhaseEnd(timingId, durationMs, {
        exitCode: 'error',
        errorMessage: message.slice(0, 1000),
      });

      // Throw so LangGraph does NOT checkpoint this node as "completed".
      throw new Error(`[fast-implement] ${message}`);
    }
  };
}

/**
 * Check whether the worktree has any uncommitted changes (new, modified, or deleted files).
 * Uses `git status --porcelain` which outputs one line per changed file, or empty if clean.
 * Returns false if the git command fails (e.g. not a git repo).
 */
function hasWorktreeChanges(cwd: string): boolean {
  try {
    const output = execSync('git status --porcelain', { cwd, encoding: 'utf-8' });
    return output.trim().length > 0;
  } catch {
    // If git command fails, assume no changes (conservative — will trigger the error)
    return false;
  }
}

/**
 * Check whether the current branch has commits that are not on the merge base
 * (i.e., the agent made new commits during implementation). Uses
 * `git log --oneline HEAD ^HEAD~1` as a lightweight check — if the agent
 * committed, HEAD will have moved from where it started.
 *
 * We compare against the branch tracking ref or check if HEAD moved at all
 * by looking at recent commits (within the last minute).
 */
function hasNewCommits(cwd: string): boolean {
  try {
    // Check if there are any commits in the last 2 minutes (generous window for agent execution)
    const output = execSync('git log --oneline --since="2 minutes ago" HEAD', {
      cwd,
      encoding: 'utf-8',
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}
