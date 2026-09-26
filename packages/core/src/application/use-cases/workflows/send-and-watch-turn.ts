/**
 * Send a workflow step's message while watching for its turn to complete.
 *
 * The orchestrators must subscribe to a turn's completion BEFORE sending the
 * message that starts it, or a fast turn can finish unobserved. That leaves a
 * window where the subscription exists but the send has not happened yet:
 * if the send throws (e.g. the agent has no interactive mode), nothing will
 * ever complete that turn and a bare `waitForTurnDone` would wait forever.
 */

import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';

export interface WatchedTurn {
  /** Settles when the turn completes; rejects if it fails. */
  done: Promise<void>;
}

/**
 * Subscribe to the next turn completion for `featureId`, then run `send`.
 *
 * If `send` throws, the subscription is aborted and the error rethrown. On
 * success the returned `done` promise is already marked handled, so a turn
 * that fails before the caller awaits it does not raise an unhandled
 * rejection — awaiting `done` still throws.
 */
export async function sendAndWatchTurn(
  session: Pick<IInteractiveSessionService, 'waitForTurnDone'>,
  featureId: string,
  send: () => Promise<unknown>
): Promise<WatchedTurn> {
  const controller = new AbortController();
  const done = session.waitForTurnDone(featureId, controller.signal);
  done.catch(() => undefined);

  try {
    await send();
  } catch (err) {
    controller.abort();
    throw err;
  }
  return { done };
}
