/**
 * Wait for the next poll tick of the agent-event stream.
 *
 * Resolves when the first of these happens: `intervalMs` elapses, the caller
 * invokes the `wake` function handed to `registerWake` (an event was queued),
 * or `signal` aborts. Whichever wins releases the other two — in particular
 * the `abort` listener is removed, so a long-lived connection does not add
 * one listener per tick to the request signal (spec 116, task 11).
 */
export function waitForNextTick(
  intervalMs: number,
  signal: AbortSignal | undefined,
  registerWake: (wake: () => void) => void
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, intervalMs);
    signal?.addEventListener('abort', finish, { once: true });
    registerWake(finish);
  });
}
