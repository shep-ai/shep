/**
 * ListHarnessPermissionsUseCase (spec 119): the Approvals inbox, the feature
 * banner and `shep harness permissions ls`. Each pending request carries the
 * scopes it may be granted with, in the user's vocabulary.
 */
import { inject, injectable } from 'tsyringe';
import {
  GrantScope,
  HarnessSessionOrigin,
  type HarnessSession,
  type PermissionDecision,
} from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessPermissionRepository,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';

export interface ListHarnessPermissionsInput {
  sessionId?: string;
  /** Feature id: list the pending requests of that feature's harness sessions. */
  featureId?: string;
  /** Include resolved decisions (the permission log); default pending only. */
  includeResolved?: boolean;
}

export interface HarnessPermissionItem {
  decision: PermissionDecision;
  session?: HarnessSession;
  /** Hard denies are never offered as approvable. */
  approvable: boolean;
  scopes: GrantScope[];
}

/** Feature runs: once / this phase / this feature. Standalone: once / this session. */
export function grantScopesFor(session: HarnessSession | undefined): GrantScope[] {
  return session?.origin === HarnessSessionOrigin.Feature
    ? [GrantScope.Once, GrantScope.Task, GrantScope.Session]
    : [GrantScope.Once, GrantScope.Session];
}

@injectable()
export class ListHarnessPermissionsUseCase {
  constructor(
    @inject(HARNESS_TOKENS.PermissionRepository)
    private readonly permissions: IHarnessPermissionRepository,
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository
  ) {}

  async execute(input: ListHarnessPermissionsInput = {}): Promise<HarnessPermissionItem[]> {
    let decisions: PermissionDecision[];
    if (input.featureId) {
      const sessions = await this.sessions.listSessions({ featureId: input.featureId });
      const lists = await Promise.all(
        sessions.map((s) =>
          input.includeResolved
            ? this.permissions.listBySession(s.id)
            : this.permissions.listPending(s.id)
        )
      );
      decisions = lists.flat();
    } else if (input.sessionId) {
      decisions = input.includeResolved
        ? await this.permissions.listBySession(input.sessionId)
        : await this.permissions.listPending(input.sessionId);
    } else {
      decisions = await this.permissions.listPending();
    }
    const cache = new Map<string, HarnessSession | undefined>();
    const items: HarnessPermissionItem[] = [];
    for (const decision of decisions) {
      if (!cache.has(decision.sessionId)) {
        cache.set(
          decision.sessionId,
          (await this.sessions.getSession(decision.sessionId)) ?? undefined
        );
      }
      const session = cache.get(decision.sessionId);
      items.push({
        decision,
        ...(session && { session }),
        approvable: !decision.hard,
        scopes: grantScopesFor(session),
      });
    }
    return items;
  }
}
