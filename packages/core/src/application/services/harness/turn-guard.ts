/**
 * Checks run before every turn of both loops (spec 119):
 * - stop: an abort signal, or a stop requested from another process (the web
 *   UI or `shep harness stop`) after this task started;
 * - user overrides: "Include from next turn" decisions recorded for the task
 *   are honoured like a pin.
 */
import { HarnessDecisionKind } from '../../../domain/generated/output.js';
import type { TurnContext } from './turn-context.js';

/** providerId of decisions a person made (as opposed to a decision provider). */
export const USER_DECISION_PROVIDER_ID = 'user';

export const STOPPED_BY_USER = 'Stopped by the user.';
export const STOPPED = 'Stopped.';

export interface UserIncludeResult {
  chunkId: string;
  include: boolean;
}

/** Returns a stop message when the task must stop, otherwise undefined. */
export async function beforeTurn(tc: TurnContext): Promise<string | undefined> {
  if (tc.abortSignal?.aborted) return STOPPED;
  const latest = await tc.sessions.getSession(tc.session.id);
  const stopAt = latest?.stopRequestedAt
    ? new Date(latest.stopRequestedAt as string | Date)
    : undefined;
  if (stopAt && stopAt.getTime() >= new Date(tc.task.createdAt as string | Date).getTime())
    return STOPPED_BY_USER;

  const decisions = await tc.execution.listDecisions(
    tc.task.id,
    HarnessDecisionKind.ChunkVisibility
  );
  for (const d of decisions) {
    if (d.providerId !== USER_DECISION_PROVIDER_ID) continue;
    const r = d.result as Partial<UserIncludeResult>;
    if (!r.chunkId) continue;
    if (r.include === false) tc.userIncludes.delete(r.chunkId);
    else tc.userIncludes.add(r.chunkId);
  }
  return undefined;
}
