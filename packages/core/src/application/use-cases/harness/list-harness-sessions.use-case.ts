/**
 * ListHarnessSessionsUseCase (spec 119): the /harness sessions table and
 * `shep harness ls`, newest first, with each session's latest task.
 */
import { inject, injectable } from 'tsyringe';
import {
  PermissionRequestStatus,
  type HarnessSession,
  type HarnessSessionOrigin,
  type HarnessTask,
} from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessPermissionRepository,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';

export interface ListHarnessSessionsInput {
  origins?: HarnessSessionOrigin[];
  featureId?: string;
  limit?: number;
}

export interface HarnessSessionListItem {
  session: HarnessSession;
  taskCount: number;
  latestTask?: HarnessTask;
  pendingPermissions: number;
}

const DEFAULT_LIMIT = 50;

@injectable()
export class ListHarnessSessionsUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.PermissionRepository)
    private readonly permissions: IHarnessPermissionRepository
  ) {}

  async execute(input: ListHarnessSessionsInput = {}): Promise<HarnessSessionListItem[]> {
    const sessions = await this.sessions.listSessions({
      ...(input.origins && { origins: input.origins }),
      ...(input.featureId && { featureId: input.featureId }),
      limit: input.limit ?? DEFAULT_LIMIT,
    });
    const pending = await this.permissions.listPending();
    return Promise.all(
      sessions.map(async (session) => {
        const tasks = await this.sessions.listTasks(session.id);
        const latestTask = tasks.at(-1);
        return {
          session,
          taskCount: tasks.length,
          ...(latestTask && { latestTask }),
          pendingPermissions: pending.filter(
            (p) => p.sessionId === session.id && p.status === PermissionRequestStatus.Pending
          ).length,
        };
      })
    );
  }
}
