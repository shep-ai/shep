/**
 * Agent Session Repository Registry (port)
 *
 * Resolves the correct IAgentSessionRepository implementation for a given
 * AgentType. The concrete implementation lives in infrastructure and looks
 * providers up via per-provider DI tokens, but application-layer callers
 * only see this interface — they never touch tsyringe or concrete classes.
 *
 * Adding a new provider requires only registering a new token in the
 * container; this interface does not change.
 */

import type { AgentType } from '../../../../domain/generated/output.js';
import type { IAgentSessionRepository } from './agent-session-repository.interface.js';

export interface IAgentSessionRepositoryRegistry {
  /**
   * Resolve the session repository for the given agent type.
   *
   * @param agentType - The agent type to resolve a repository for
   * @returns The IAgentSessionRepository implementation for the agent type
   */
  getRepository(agentType: AgentType): IAgentSessionRepository;
}
