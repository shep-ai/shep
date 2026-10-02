/**
 * ApplyHarnessSessionUseCase (spec 119, F4 "Apply"): commit the standalone
 * worktree's changes and point a branch of the source repository at them.
 * Nothing is pushed and the user's checkout is not switched.
 */
import { inject, injectable } from 'tsyringe';
import { HarnessSessionStatus } from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessSessionRepository,
  type IHarnessWorkspaceService,
} from '../../ports/output/harness/index.js';
import { HarnessSessionStateError } from './harness-errors.js';
import { loadFinishedStandaloneSession } from './standalone-session.js';

export interface ApplyHarnessSessionInput {
  sessionId: string;
  /** Branch to create; defaults to the worktree's own harness/<id> branch. */
  branch?: string;
  message?: string;
}

export interface ApplyHarnessSessionResult {
  branch: string;
  commit: string;
  files: string[];
}

@injectable()
export class ApplyHarnessSessionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.WorkspaceService) private readonly workspaces: IHarnessWorkspaceService
  ) {}

  async execute(input: ApplyHarnessSessionInput): Promise<ApplyHarnessSessionResult> {
    const session = await loadFinishedStandaloneSession(this.sessions, input.sessionId);
    const { files } = await this.workspaces.changes(session.worktreePath, session.baseCommit);
    if (files.length === 0)
      throw new HarnessSessionStateError('The session made no changes to apply');
    const message = input.message?.trim() ? input.message.trim() : `harness: ${session.title}`;
    const commit = await this.workspaces.commitAll(session.worktreePath, message);
    if (!commit) throw new HarnessSessionStateError('The session made no changes to apply');
    const branch = input.branch?.trim() ? input.branch.trim() : session.worktreeBranch;
    if (branch !== session.worktreeBranch) {
      await this.workspaces.createBranch(session.sourceRepoPath, branch, commit);
    }
    await this.sessions.updateSession({
      ...session,
      status: HarnessSessionStatus.Completed,
      updatedAt: new Date(),
    });
    return { branch, commit, files };
  }
}
