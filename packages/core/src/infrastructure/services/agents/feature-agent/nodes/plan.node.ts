import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { executeNode, type MemorySelector } from './node-helpers.js';
import { buildPlanPrompt } from './prompts/plan.prompt.js';

/**
 * Creates the plan node that generates an implementation plan (plan.yaml)
 * and task breakdown with TDD cycles (tasks.yaml) from spec and research.
 */
export function createPlanNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  return executeNode('plan', executor, buildPlanPrompt, selectMemory);
}
