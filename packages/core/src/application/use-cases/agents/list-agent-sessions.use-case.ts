/**
 * List Agent Sessions Use Case
 *
 * Lists agent provider CLI sessions for the configured or specified agent.
 * Resolves the correct repository via AgentSessionRepositoryRegistry and
 * emits a warning for providers not yet implemented (stub repositories).
 */

import { injectable, inject } from 'tsyringe';
import type { AgentSession, AgentType } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IAgentSessionRepositoryRegistry } from '../../ports/output/agents/agent-session-repository-registry.interface.js';

export interface ListAgentSessionsInput {
  /** Agent type to query; falls back to configured default when omitted */
  agentType?: AgentType;
  /** Maximum sessions to return (default 20, 0 = all) */
  limit?: number;
}

@injectable()
export class ListAgentSessionsUseCase {
  constructor(
    @inject('IAgentSessionRepositoryRegistry')
    private readonly registry: IAgentSessionRepositoryRegistry,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input?: ListAgentSessionsInput): Promise<AgentSession[]> {
    const agentType = await this.resolveAgentType(input?.agentType);
    const repository = this.registry.getRepository(agentType);

    if (!repository.isSupported()) {
      process.stderr.write(`Warning: Session listing is not yet implemented for ${agentType}\n`);
      return [];
    }

    const limit = input?.limit ?? 20;
    return repository.list({ limit });
  }

  private async resolveAgentType(agentType?: AgentType): Promise<AgentType> {
    if (agentType) return agentType;
    const settings = await this.settingsRepository.load();
    if (settings === null) {
      throw new Error('Settings not initialized. Cannot resolve default agent type.');
    }
    return settings.agent.type;
  }
}
