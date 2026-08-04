/**
 * Archive Agent Session Use Case
 *
 * Hides a session from the Control Center tree without touching any provider
 * file.
 *
 * Safe by construction: this use case is given ONLY the archive marker
 * repository. It has no filesystem collaborator, so it cannot modify or remove
 * a transcript even by mistake — which is what makes archiving reversible and
 * distinct from deletion.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentType } from '../../../domain/generated/output.js';
import type { IArchivedSessionRepository } from '../../ports/output/repositories/archived-session.repository.interface.js';

export interface ArchiveAgentSessionInput {
  sessionId: string;
  agentType: AgentType | string;
}

@injectable()
export class ArchiveAgentSessionUseCase {
  constructor(
    @inject('IArchivedSessionRepository')
    private readonly archived: IArchivedSessionRepository
  ) {}

  /** Archive a session. Idempotent. */
  async archive(input: ArchiveAgentSessionInput): Promise<void> {
    this.assertIdentified(input);
    await this.archived.archive({ agentType: input.agentType, sessionId: input.sessionId });
  }

  /** Restore an archived session. Idempotent. */
  async unarchive(input: ArchiveAgentSessionInput): Promise<void> {
    this.assertIdentified(input);
    await this.archived.unarchive({ agentType: input.agentType, sessionId: input.sessionId });
  }

  async isArchived(input: ArchiveAgentSessionInput): Promise<boolean> {
    this.assertIdentified(input);
    return this.archived.isArchived({ agentType: input.agentType, sessionId: input.sessionId });
  }

  private assertIdentified(input: ArchiveAgentSessionInput): void {
    if (!input.sessionId || String(input.agentType) === '') {
      throw new Error('sessionId and agentType are required to archive a session');
    }
  }
}
