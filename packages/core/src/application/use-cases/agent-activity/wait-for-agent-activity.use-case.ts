/**
 * Wait For Agent Activity Use Case (spec 148)
 *
 * Returns as soon as one feature reaches an awaited state — by default the
 * moment it needs someone or stops (blocked, done, failed) — or reports why it
 * did not: a time limit, a missing or ambiguous id, or the caller aborting.
 * A feature already in an awaited state returns at once.
 */

import { inject, injectable } from 'tsyringe';
import { ActivityWaitOutcome } from '../../../domain/generated/output.js';
import { DEFAULT_WAIT_TARGETS } from '../../../domain/shared/agent-activity.js';
import { GetAgentActivityUseCase } from './get-agent-activity.use-case.js';
import { WatchAgentActivityUseCase } from './watch-agent-activity.use-case.js';
import type {
  AgentActivity,
  WaitForAgentActivityInput,
  WaitForAgentActivityResult,
} from './agent-activity.types.js';

@injectable()
export class WaitForAgentActivityUseCase {
  constructor(
    @inject(GetAgentActivityUseCase)
    private readonly getActivity: GetAgentActivityUseCase,
    @inject(WatchAgentActivityUseCase)
    private readonly watchActivity: WatchAgentActivityUseCase
  ) {}

  async execute(input: WaitForAgentActivityInput): Promise<WaitForAgentActivityResult> {
    const { activities } = await this.getActivity.execute({ featureId: input.featureId });
    if (activities.length === 0) return { outcome: ActivityWaitOutcome.NotFound };
    if (activities.length > 1) return { outcome: ActivityWaitOutcome.Ambiguous };

    const [feature] = activities;
    const targets = new Set(input.until ?? DEFAULT_WAIT_TARGETS);
    const limit = waitSignal(input);
    let last: AgentActivity = feature;
    try {
      for await (const { activity } of this.watchActivity.watch({
        featureId: feature.featureId,
        signal: limit.signal,
        ...(input.intervalMs !== undefined ? { intervalMs: input.intervalMs } : {}),
      })) {
        last = activity;
        if (targets.has(activity.state)) {
          return { outcome: ActivityWaitOutcome.Matched, activity };
        }
      }
    } finally {
      limit.dispose();
    }
    const outcome = input.signal?.aborted
      ? ActivityWaitOutcome.Aborted
      : ActivityWaitOutcome.TimedOut;
    return { outcome, activity: last };
  }
}

/** The caller's signal, ended early by the time limit when there is one. */
function waitSignal(input: WaitForAgentActivityInput): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  input.signal?.addEventListener('abort', stop, { once: true });
  if (input.signal?.aborted) stop();
  const timer = input.timeoutMs !== undefined ? setTimeout(stop, input.timeoutMs) : undefined;
  return {
    signal: controller.signal,
    dispose: () => {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', stop);
    },
  };
}
