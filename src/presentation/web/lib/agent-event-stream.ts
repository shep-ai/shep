/**
 * Wire constants and client-side list helpers for the `/api/agent-events`
 * SSE stream. Shared by the route (server) and `useAgentEvents` (client), so
 * this module must stay free of server-only and core runtime imports.
 */

/**
 * Named SSE event the route sends as its keep-alive. It is a named event
 * rather than an SSE comment (`: heartbeat`) because EventSource never
 * dispatches comments to JavaScript, so a comment cannot reset the direct
 * client's watchdog. Consumers without a listener for it (the service
 * worker) ignore it, as EventSource does for every unlistened event name.
 */
export const AGENT_EVENTS_HEARTBEAT_EVENT = 'heartbeat';

/** Upper bound on a client-side event list, and how many to keep when pruning. */
export interface ListBound {
  max: number;
  keep: number;
}

export const DEFAULT_LIST_BOUND: ListBound = { max: 500, keep: 250 };

function prune<T>(list: T[], bound: ListBound): T[] {
  return list.length > bound.max ? list.slice(-bound.keep) : list;
}

/** Append `row`, pruning to the newest `bound.keep` entries past `bound.max`. */
export function appendBounded<T>(prev: T[], row: T, bound: ListBound = DEFAULT_LIST_BOUND): T[] {
  return prune([...prev, row], bound);
}

/**
 * Insert `row`, or replace the entry with the same key in place.
 *
 * Defence in depth against a stream that delivers a row twice (e.g. a
 * reconnect replay): the list holds one entry per id, and the latest delivery
 * wins, so a question's `status` transition supersedes its `new` event instead
 * of leaving a stale `pending` copy behind.
 */
export function upsertById<T>(
  prev: T[],
  row: T,
  keyOf: (row: T) => string,
  bound: ListBound = DEFAULT_LIST_BOUND
): T[] {
  const key = keyOf(row);
  const index = prev.findIndex((existing) => keyOf(existing) === key);
  if (index === -1) return appendBounded(prev, row, bound);
  const next = [...prev];
  next[index] = row;
  return next;
}
