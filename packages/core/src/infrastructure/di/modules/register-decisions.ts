/**
 * Unified decisions (spec 134): the inbox read model, the per-session bridge
 * that records chat questions in the inbox, and agent-asked decisions.
 */

import type { DependencyContainer } from 'tsyringe';

import { ListAgentQuestionInboxUseCase } from '../../../application/use-cases/agents/list-agent-question-inbox.use-case.js';
import { AskAgentDecisionUseCase } from '../../../application/use-cases/agents/ask-agent-decision.use-case.js';
import { AgentQuestionBridgeFactory } from '../../services/agents/agent-question-service/agent-question-bridge.factory.js';

export function registerDecisions(container: DependencyContainer): void {
  container.registerSingleton(ListAgentQuestionInboxUseCase);
  container.register('ListAgentQuestionInboxUseCase', {
    useFactory: (c) => c.resolve(ListAgentQuestionInboxUseCase),
  });
  container.registerSingleton(AgentQuestionBridgeFactory);
  // Part 2: a headless agent asks through the ask_decision MCP tool.
  container.registerSingleton(AskAgentDecisionUseCase);
  container.register('AskAgentDecisionUseCase', {
    useFactory: (c) => c.resolve(AskAgentDecisionUseCase),
  });
}
