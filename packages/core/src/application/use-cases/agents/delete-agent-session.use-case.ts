/**
 * Delete Agent Session Use Case
 *
 * Permanently removes a session's transcript from provider storage.
 *
 * Business Rules:
 * - The provider must implement the optional `delete` capability. When it does
 *   not, this fails with a typed error rather than silently doing nothing.
 * - Deletion NEVER cascades. A feature adopted from the session is independent
 *   data and is left untouched; its `sourceAgentSessionId` may be left dangling,
 *   which is accepted by design — the transcript is the user's to remove, the
 *   derived feature is shep's work product.
 * - Containment is enforced inside each provider repository, which owns the
 *   knowledge of its own storage layout.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentType } from '../../../domain/generated/output.js';
import type { IAgentSessionRepositoryRegistry } from '../../ports/output/agents/agent-session-repository-registry.interface.js';

export interface DeleteAgentSessionInput {
  sessionId: string;
  agentType: AgentType | string;
}

export interface DeleteAgentSessionResult {
  /** True when a transcript was removed; false when none was found on disk */
  deleted: boolean;
}

/** Raised when the provider cannot delete transcripts. */
export class SessionDeletionUnsupportedError extends Error {
  constructor(public readonly agentType: string) {
    super(`Deleting sessions is not supported for provider "${agentType}"`);
    this.name = 'SessionDeletionUnsupportedError';
  }
}

@injectable()
export class DeleteAgentSessionUseCase {
  constructor(
    @inject('IAgentSessionRepositoryRegistry')
    private readonly registry: IAgentSessionRepositoryRegistry
  ) {}

  async execute(input: DeleteAgentSessionInput): Promise<DeleteAgentSessionResult> {
    if (!input.sessionId) {
      throw new Error('sessionId is required to delete a session');
    }

    const repository = this.registry.getRepository(input.agentType as AgentType);

    // Probe the optional capability rather than assuming it — the stub and
    // unsupported providers deliberately do not implement delete.
    if (!repository.isSupported() || typeof repository.delete !== 'function') {
      throw new SessionDeletionUnsupportedError(String(input.agentType));
    }

    const deleted = await repository.delete(input.sessionId);
    return { deleted };
  }

  /** Whether deletion is available for the given provider. */
  supportsDeletion(agentType: AgentType | string): boolean {
    const repository = this.registry.getRepository(agentType as AgentType);
    return repository.isSupported() && typeof repository.delete === 'function';
  }
}
