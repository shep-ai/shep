/**
 * Watch Agent Activity Use Case (spec 148)
 *
 * Polls the activity and yields one change per feature whose activity moved:
 * its state, reason, phase, run status or open question. The first read
 * yields every feature (done ones only when asked); after that a feature that
 * finishes is still reported. Versions never go down within one watch, so a
 * consumer can drop anything at or below the last version it handled.
 *
 * Polling, not push: feature agents run as separate processes and SQLite is
 * the only thing every process shares.
 */

import { inject, injectable } from 'tsyringe';
import { AgentActivityState } from '../../../domain/generated/output.js';
import { waitForNextTick } from '../agents/stream-agent-events/wait-for-next-tick.js';
import { GetAgentActivityUseCase } from './get-agent-activity.use-case.js';
import {
  DEFAULT_ACTIVITY_POLL_MS,
  type AgentActivity,
  type AgentActivityChange,
  type WatchAgentActivityInput,
} from './agent-activity.types.js';

const NO_WAKE = (): void => undefined;

@injectable()
export class WatchAgentActivityUseCase {
  constructor(
    @inject(GetAgentActivityUseCase)
    private readonly getActivity: GetAgentActivityUseCase
  ) {}

  async *watch(input: WatchAgentActivityInput = {}): AsyncGenerator<AgentActivityChange> {
    const { signal, intervalMs = DEFAULT_ACTIVITY_POLL_MS, ...query } = input;
    const seen = new Map<string, AgentActivity>();
    let lastVersion = 0;
    let first = true;

    while (!signal?.aborted) {
      const { activities } = await this.getActivity.execute({ ...query, includeSettled: true });
      for (const activity of activities) {
        const previous = seen.get(activity.featureId);
        seen.set(activity.featureId, activity);
        if (previous ? !changed(previous, activity) : skipOnFirstRead(activity, first, query)) {
          continue;
        }
        lastVersion = Math.max(activity.version, lastVersion + 1);
        yield {
          activity: { ...activity, version: lastVersion },
          ...(previous ? { previous: { state: previous.state, reason: previous.reason } } : {}),
          version: lastVersion,
        };
        if (signal?.aborted) return;
      }
      first = false;
      await waitForNextTick(intervalMs, signal, NO_WAKE);
    }
  }
}

/** A done feature in a plain list is history, not news; one asked for by id is the answer. */
function skipOnFirstRead(
  activity: AgentActivity,
  first: boolean,
  query: Omit<WatchAgentActivityInput, 'signal' | 'intervalMs'>
): boolean {
  if (!first || query.featureId || query.includeSettled) return false;
  return activity.state === AgentActivityState.Done;
}

function changed(before: AgentActivity, after: AgentActivity): boolean {
  return (
    before.state !== after.state ||
    before.reason !== after.reason ||
    before.phase !== after.phase ||
    before.runStatus !== after.runStatus ||
    before.pendingQuestion?.id !== after.pendingQuestion?.id
  );
}
