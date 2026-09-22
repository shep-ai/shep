/**
 * Tunnel reconnect + liveness policy for MessagingTunnelAdapter.
 *
 * Every failure (failed upgrade, token fetch error, close, missed pong) is
 * retried after a capped exponential delay with downward jitter, so a
 * gateway outage neither kills the tunnel nor makes every client reconnect
 * in lockstep when it recovers.
 */

/** First reconnect delay; doubles per consecutive failure. */
export const TUNNEL_RECONNECT_BASE_DELAY_MS = 1_000;
/** Upper bound for the reconnect delay. */
export const TUNNEL_RECONNECT_MAX_DELAY_MS = 60_000;
/** Fraction of the delay that jitter may shave off, so many clients do not reconnect in lockstep. */
export const TUNNEL_RECONNECT_JITTER_RATIO = 0.2;
export const TUNNEL_PING_INTERVAL_MS = 25_000;
/** A ping unanswered for this long means the socket is half-open. */
export const TUNNEL_PONG_TIMEOUT_MS = 10_000;

/**
 * Delay before reconnect attempt number `attempt` (0-based): the base delay
 * doubled per attempt, capped, then reduced by up to the jitter ratio.
 */
export function computeReconnectDelay(attempt: number, random: () => number): number {
  const exponential = TUNNEL_RECONNECT_BASE_DELAY_MS * 2 ** attempt;
  const capped = Math.min(TUNNEL_RECONNECT_MAX_DELAY_MS, exponential);
  return capped * (1 - TUNNEL_RECONNECT_JITTER_RATIO * random());
}
