/**
 * Unified decisions (spec 134): the inbox read model and the per-session
 * bridge that records chat questions in the inbox.
 */

import type { DependencyContainer } from 'tsyringe';

import { ListAgentQuestionInboxUseCase } from '../../../application/use-cases/agents/list-agent-question-inbox.use-case.js';
import { AgentQuestionBridgeFactory } from '../../services/agents/agent-question-service/agent-question-bridge.factory.js';

export function registerDecisions(container: DependencyContainer): void {
  container.registerSingleton(ListAgentQuestionInboxUseCase);
  container.register('ListAgentQuestionInboxUseCase', {
    useFactory: (c) => c.resolve(ListAgentQuestionInboxUseCase),
  });
  container.registerSingleton(AgentQuestionBridgeFactory);
}
