/**
 * Prototype-Generate Node
 *
 * Exploration mode node that generates a quick prototype by calling the
 * agent executor with an exploration-focused prompt. After generation,
 * interrupts for user feedback. Uses shared utilities (retryExecute,
 * createNodeLogger) but NOT executeNode() which is coupled to approval gates.
 *
 * Follows the same factory pattern as other nodes: takes executor
 * dependency, returns async (state) => Partial<FeatureAgentState>.
 */

import { interrupt, isGraphBubbleUp } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { FeatureAgentState } from '../state.js';
import { createNodeLogger, buildExecutorOptions, retryExecute } from './node-helpers.js';
import { reportNodeStart } from '../heartbeat.js';
import { recordPhaseStart, recordPhaseEnd } from '../phase-timing-context.js';
import { updateNodeLifecycle } from '../lifecycle-context.js';
import { buildPrototypeGeneratePrompt } from './prompts/prototype-generate.prompt.js';

/**
 * Factory that creates the prototype-generate node function.
 *
 * @param executor - The agent executor to use for prototype generation
 * @returns A LangGraph node function
 */
export function createPrototypeGenerateNode(executor: IAgentExecutor) {
  const log = createNodeLogger('prototype-generate');

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.activate();
    const iterationCount = state.iterationCount ?? 0;
    const maxIterations = state.maxIterations ?? 10;

    log.info(`Starting prototype generation (iteration ${iterationCount + 1}/${maxIterations})`);
    reportNodeStart('prototype-generate');
    await updateNodeLifecycle('prototype-generate');

    // Check if max iterations reached — force user to promote or discard
    if (iterationCount >= maxIterations) {
      log.info(`Max iterations (${maxIterations}) reached — interrupting for final action`);
      interrupt({
        node: 'prototype-generate',
        message: `Maximum iterations (${maxIterations}) reached. Please promote or discard this exploration.`,
        iterationCount,
        maxIterations,
        forceAction: true,
      });

      // If we get here after resume, the graph router will handle the action
      return {
        currentNode: 'prototype-generate',
        explorationStatus: 'waiting-feedback',
        messages: [
          `[prototype-generate] Max iterations reached (${maxIterations}) — awaiting promote/discard`,
        ],
      };
    }

    const startTime = Date.now();
    const prompt = buildPrototypeGeneratePrompt(state);
    const timingId = await recordPhaseStart('prototype-generate', {
      prompt,
      modelId: state.model,
      agentType: executor.agentType,
    });

    try {
      const options = buildExecutorOptions(state, undefined, 'prototype-generate');
      log.info(`Executing agent at cwd=${options.cwd}`);
      log.info(`Prompt length: ${prompt.length} chars`);

      const result = await retryExecute(executor, prompt, options, { logger: log });
      const durationMs = Date.now() - startTime;
      const elapsed = (durationMs / 1000).toFixed(1);
      log.info(`Prototype generated (${result.result.length} chars, ${elapsed}s)`);

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

      const newIterationCount = iterationCount + 1;

      // Interrupt for user feedback
      log.info(`Interrupting for feedback (iteration ${newIterationCount}/${maxIterations})`);
      interrupt({
        node: 'prototype-generate',
        message: `Prototype iteration ${newIterationCount} complete. Review and provide feedback, promote, or discard.`,
        iterationCount: newIterationCount,
        maxIterations,
        resultSummary: result.result.slice(0, 500),
      });

      // After resume, return the updated state
      return {
        currentNode: 'prototype-generate',
        iterationCount: newIterationCount,
        explorationStatus: 'waiting-feedback',
        messages: [
          `[prototype-generate] Iteration ${newIterationCount} complete (${result.result.length} chars, ${elapsed}s)`,
        ],
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

      // Throw so LangGraph does NOT checkpoint this node as "completed"
      throw new Error(`[prototype-generate] ${message}`);
    }
  };
}
