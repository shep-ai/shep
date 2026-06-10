import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { executeNode, type MemorySelector } from './node-helpers.js';
import { buildRequirementsPrompt } from './prompts/requirements.prompt.js';

/**
 * Creates the requirements node that builds comprehensive requirements
 * with product questions and AI-recommended defaults, writing to spec.yaml.
 */
export function createRequirementsNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  return executeNode('requirements', executor, buildRequirementsPrompt, selectMemory);
}
