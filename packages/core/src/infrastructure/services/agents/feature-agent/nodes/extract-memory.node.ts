/**
 * Extract-Memory Node ("Shep Brain").
 *
 * Terminal post-merge node. When a feature has actually been merged, it asks
 * the agent to distil durable project knowledge from the change and upserts the
 * resulting entries into the per-repository memory store via the record use
 * case. Every future feature then reads this memory at its start.
 *
 * Best-effort by contract: this node NEVER throws and NEVER interrupts.
 * A failure to extract or persist memory must not fail or stall the feature —
 * it returns the state unchanged with a diagnostic message.
 */

import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { RecordProjectMemoryUseCase } from '@/application/use-cases/project-memory/record-project-memory.use-case.js';
import type { FeatureAgentState } from '../state.js';
import { createNodeLogger, buildExecutorOptions } from './node-helpers.js';
import { buildExtractMemoryPrompt } from './prompts/extract-memory.prompt.js';
import { parseMemoryEntries } from './extract-memory-output-parser.js';

const NODE_NAME = 'extract_memory';

/**
 * Dependencies for the extract-memory node. Typed structurally so tests can
 * supply lightweight stubs without constructing the real use case.
 */
export interface ExtractMemoryNodeDeps {
  executor: IAgentExecutor;
  recordProjectMemory: Pick<RecordProjectMemoryUseCase, 'execute'>;
}

export function createExtractMemoryNode(deps: ExtractMemoryNodeDeps) {
  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    const log = createNodeLogger(NODE_NAME);

    if (!state.merged) {
      log.info('Feature was not merged — skipping memory extraction');
      return {
        currentNode: NODE_NAME,
        messages: [`[${NODE_NAME}] Skipped (feature not merged)`],
        _needsReexecution: false,
      };
    }

    try {
      const prompt = buildExtractMemoryPrompt(state);
      // The worktree is removed after a successful merge, so run in the main
      // repository checkout rather than buildExecutorOptions' worktree default.
      const options = {
        ...buildExecutorOptions(state, undefined, NODE_NAME),
        cwd: state.repositoryPath,
      };

      const result = await deps.executor.execute(prompt, options);
      const entries = parseMemoryEntries(result.result);

      if (entries.length === 0) {
        log.info('No durable memory entries extracted');
        return {
          currentNode: NODE_NAME,
          messages: [`[${NODE_NAME}] No memory entries extracted`],
          _needsReexecution: false,
        };
      }

      const { recorded } = await deps.recordProjectMemory.execute({
        repositoryPath: state.repositoryPath,
        sourceFeatureId: state.featureId,
        entries,
      });

      log.info(`Recorded ${recorded} project-memory entries`);
      return {
        currentNode: NODE_NAME,
        messages: [`[${NODE_NAME}] Recorded ${recorded} project-memory entries`],
        _needsReexecution: false,
      };
    } catch (err: unknown) {
      // Best-effort: swallow all errors so memory extraction can never fail the
      // feature. The merge has already succeeded by the time we reach here.
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Memory extraction failed (ignored): ${message}`);
      return {
        currentNode: NODE_NAME,
        messages: [`[${NODE_NAME}] Extraction failed (ignored): ${message}`],
        _needsReexecution: false,
      };
    }
  };
}
