/**
 * DiscardHarnessSessionUseCase (spec 119, F4 "Discard"): remove the standalone
 * worktree. The session's state and evidence stay in the store.
 */
import { inject, injectable } from 'tsyringe';
import { HarnessSessionStatus, type HarnessSession } from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessSessionRepository,
  type IHarnessWorkspaceService,
} from '../../ports/output/harness/index.js';
import { loadFinishedStandaloneSession } from './standalone-session.js';

@injectable()
export class DiscardHarnessSessionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.WorkspaceService) private readonly workspaces: IHarnessWorkspaceService
  ) {}

  async execute(input: { sessionId: string }): Promise<HarnessSession> {
    const session = await loadFinishedStandaloneSession(this.sessions, input.sessionId);
    if (await this.workspaces.exists(session.worktreePath)) {
      await this.workspaces.remove(session.sourceRepoPath, session.worktreePath);
    }
    const updated: HarnessSession = {
      ...session,
      status: HarnessSessionStatus.Discarded,
      updatedAt: new Date(),
    };
    await this.sessions.updateSession(updated);
    return updated;
  }
}
