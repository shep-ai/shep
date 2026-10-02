/** Shared checks of the standalone outcome use cases (apply, discard, promote). */
import {
  HarnessSessionOrigin,
  HarnessSessionStatus,
  HarnessTaskStatus,
  type HarnessSession,
} from '../../../domain/generated/output.js';
import type { IHarnessSessionRepository } from '../../ports/output/harness/index.js';
import { HarnessNotFoundError, HarnessSessionStateError } from './harness-errors.js';

const ACTIVE_TASK: ReadonlySet<HarnessTaskStatus> = new Set([
  HarnessTaskStatus.Pending,
  HarnessTaskStatus.Running,
  HarnessTaskStatus.Blocked,
]);

export interface StandaloneWorkspaceSession extends HarnessSession {
  worktreePath: string;
  worktreeBranch: string;
  sourceRepoPath: string;
  baseCommit: string;
}

export async function loadFinishedStandaloneSession(
  sessions: IHarnessSessionRepository,
  sessionId: string
): Promise<StandaloneWorkspaceSession> {
  const session = await sessions.getSession(sessionId);
  if (!session) throw new HarnessNotFoundError('session', sessionId);
  if (session.origin !== HarnessSessionOrigin.Standalone) {
    throw new HarnessSessionStateError(
      'Only standalone sessions have a worktree to apply or discard'
    );
  }
  if (session.status === HarnessSessionStatus.Discarded) {
    throw new HarnessSessionStateError('This session was already discarded');
  }
  if (
    !session.worktreePath ||
    !session.worktreeBranch ||
    !session.sourceRepoPath ||
    !session.baseCommit
  ) {
    throw new HarnessSessionStateError('This session has no worktree');
  }
  const tasks = await sessions.listTasks(session.id);
  if (tasks.some((t) => ACTIVE_TASK.has(t.status))) {
    throw new HarnessSessionStateError('A task is still running in this session; stop it first');
  }
  return session as StandaloneWorkspaceSession;
}
