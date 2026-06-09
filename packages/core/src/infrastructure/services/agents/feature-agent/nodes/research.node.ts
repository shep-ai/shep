import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { executeNode, type MemorySelector } from './node-helpers.js';
import { buildResearchPrompt } from './prompts/research.prompt.js';

/**
 * Creates the research node that evaluates technical approaches,
 * libraries, and architecture decisions, writing to research.yaml.
 */
export function createResearchNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  return executeNode('research', executor, buildResearchPrompt, selectMemory);
}
