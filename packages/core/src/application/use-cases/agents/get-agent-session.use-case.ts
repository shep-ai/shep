/**
 * Get Agent Session Use Case
 *
 * Retrieves a single agent provider CLI session by ID, including its
 * conversation messages (up to messageLimit). Throws SessionNotFoundError
 * if the session does not exist.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentSession, AgentType } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IAgentSessionRepositoryRegistry } from '../../ports/output/agents/agent-session-repository-registry.interface.js';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

export interface GetAgentSessionInput {
  /** The session ID (provider-native filename without extension) */
  id: string;
  /** Agent type to query; falls back to configured default when omitted */
  agentType?: AgentType;
  /** Maximum number of messages to include (default 20, 0 = all) */
  messageLimit?: number;
}

@injectable()
export class GetAgentSessionUseCase {
  constructor(
    @inject('IAgentSessionRepositoryRegistry')
    private readonly registry: IAgentSessionRepositoryRegistry,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input: GetAgentSessionInput): Promise<AgentSession> {
    const agentType = await this.resolveAgentType(input.agentType);
    const repository = this.registry.getRepository(agentType);
    const messageLimit = input.messageLimit ?? 20;

    const session = await repository.findById(input.id, { messageLimit });

    if (session === null) {
      throw new SessionNotFoundError(input.id);
    }

    return session;
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
