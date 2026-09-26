/**
 * sendAndWatchTurn unit tests
 *
 * The workflow orchestrators subscribe to a turn's completion BEFORE sending
 * the message that starts it, so a fast turn cannot finish unobserved. If the
 * send itself throws, nothing will ever complete that turn — the subscription
 * must be torn down, not left waiting forever.
 */

import { describe, it, expect, vi } from 'vitest';

import { sendAndWatchTurn } from '@/application/use-cases/workflows/send-and-watch-turn.js';

function makeSession() {
  let settle: { resolve: () => void; reject: (err: Error) => void } | undefined;
  let signal: AbortSignal | undefined;
  const waitForTurnDone = vi.fn((_featureId: string, abortSignal?: AbortSignal) => {
    signal = abortSignal;
    return new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
      abortSignal?.addEventListener('abort', () => reject(new Error('waitForTurnDone aborted')));
    });
  });
  return {
    session: { waitForTurnDone },
    settle: () => settle!,
    signal: () => signal,
  };
}

describe('sendAndWatchTurn', () => {
  it('subscribes to the turn before sending', async () => {
    const { session } = makeSession();
    const order: string[] = [];
    session.waitForTurnDone.mockImplementationOnce(() => {
      order.push('subscribe');
      return new Promise<void>(() => undefined);
    });

    await sendAndWatchTurn(session, 'feat-1', async () => {
      order.push('send');
    });

    expect(order).toEqual(['subscribe', 'send']);
    expect(session.waitForTurnDone).toHaveBeenCalledWith('feat-1', expect.any(AbortSignal));
  });

  it('returns a turn that settles with the turn outcome', async () => {
    const { session, settle } = makeSession();

    const turn = await sendAndWatchTurn(session, 'feat-1', async () => undefined);
    settle().resolve();

    await expect(turn.done).resolves.toBeUndefined();
  });

  it('aborts the subscription and rethrows when the send fails', async () => {
    const { session, signal } = makeSession();
    const failure = new Error('agent does not support chat');

    await expect(
      sendAndWatchTurn(session, 'feat-1', async () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(signal()?.aborted).toBe(true);
  });

  // The caller awaits `done` only after other async work (resolving the
  // session id, seeding steps). A turn that fails in the meantime must not
  // surface as an unhandled rejection — but awaiting it later still throws.
  it('does not raise an unhandled rejection when the turn fails before it is awaited', async () => {
    const { session, settle } = makeSession();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const turn = await sendAndWatchTurn(session, 'feat-1', async () => undefined);
      settle().reject(new Error('session failed'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
      await expect(turn.done).rejects.toThrow('session failed');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
