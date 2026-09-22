/**
 * Daemon readiness probe for `shep start`.
 *
 * The daemon is only recorded in daemon.json once it is actually serving:
 * a child that passes the short settle window and then dies while booting
 * (EADDRINUSE, a crash in Next.js start-up) must not leave a dead pid on
 * record. The probe races an HTTP GET loop against the child's exit and is
 * bounded by a named timeout; the loser is cancelled so no timer outlives it.
 */

import http from 'node:http';

/** Max time (ms) to wait for the server to become reachable. */
export const READY_TIMEOUT_MS = 30_000;
/** Interval (ms) between readiness probes. */
export const READY_POLL_MS = 300;
/** Per-request budget (ms) for a single readiness probe. */
const PROBE_REQUEST_TIMEOUT_MS = 2_000;

export enum DaemonReadiness {
  Ready = 'ready',
  Exited = 'exited',
  TimedOut = 'timed-out',
}

interface CancellableProbe {
  result: Promise<boolean>;
  cancel(): void;
}

/**
 * Poll a URL until it returns any HTTP response (even 500). Resolves true
 * when reachable, false on timeout or cancel.
 */
function probeUntilReachable(url: string, timeoutMs: number): CancellableProbe {
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: http.ClientRequest | undefined;
  let finish: (reachable: boolean) => void = () => undefined;

  const result = new Promise<boolean>((resolve) => {
    let settled = false;
    finish = (reachable) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(reachable);
    };

    const retry = () => {
      if (settled) return;
      timer = setTimeout(probe, READY_POLL_MS);
    };

    function probe() {
      if (settled) return;
      if (Date.now() > deadline) return finish(false);
      request = http.get(url, (res) => {
        // Drain the response so the socket doesn't keep the event loop alive
        res.resume();
        res.on('end', () => finish(true));
      });
      request.on('error', retry);
      request.setTimeout(PROBE_REQUEST_TIMEOUT_MS, () => {
        request?.destroy();
        retry();
      });
    }
    probe();
  });

  return {
    result,
    cancel: () => {
      request?.destroy();
      finish(false);
    },
  };
}

/**
 * Wait until the daemon at `url` answers, the child exits, or the timeout
 * elapses — whichever comes first.
 */
export async function waitForDaemonReady(
  url: string,
  childExited: Promise<unknown>,
  timeoutMs: number = READY_TIMEOUT_MS
): Promise<DaemonReadiness> {
  const probe = probeUntilReachable(url, timeoutMs);
  try {
    return await Promise.race([
      childExited.then(() => DaemonReadiness.Exited),
      probe.result.then((reachable) =>
        reachable ? DaemonReadiness.Ready : DaemonReadiness.TimedOut
      ),
    ]);
  } finally {
    probe.cancel();
  }
}
