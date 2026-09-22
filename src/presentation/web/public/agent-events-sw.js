/**
 * Service Worker: agent-events-sw.js
 *
 * Maintains one SSE connection to /api/agent-events per stream scope (the
 * global stream, or one per `runId`) and relays its events to the tabs
 * subscribed to that scope via postMessage.
 *
 * Subscribers are tracked by client id, so a tab that subscribes twice (e.g.
 * on mount and again on `controllerchange`) counts once, and a tab that
 * closed without unsubscribing is pruned the next time the worker lists its
 * clients. A scope's connection closes when its last subscriber leaves.
 *
 * Browsers may terminate an idle worker, dropping this in-memory state. The
 * worker forwards the server heartbeat so a page can notice the silence and
 * subscribe again, which restarts the worker and its connection.
 *
 * Messages FROM clients:
 *   { type: 'subscribe', runId?: string }  — register (or re-register) this tab
 *   { type: 'unsubscribe' }                — unregister this tab
 *
 * Messages TO clients:
 *   { type: 'notification', data: NotificationEvent }
 *   { type: 'agent_message', data: AgentMessageStreamEvent }       (spec 093)
 *   { type: 'agent_question', data: AgentQuestionStreamEvent }     (spec 093)
 *   { type: 'supervisor_decision', data: SupervisorDecisionStreamEvent } (spec 093)
 *   { type: 'heartbeat' }                                          (liveness only)
 *   { type: 'status', status: 'connected' | 'connecting' | 'disconnected' }
 */

/* global self, EventSource, setTimeout, clearTimeout */

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const STABLE_CONNECTION_MS = 5_000;
const STREAM_PATH = '/api/agent-events';
/** Scope key of the unfiltered stream (a subscriber that sent no runId). */
const GLOBAL_SCOPE = '';
/** Named SSE event the route sends as keep-alive (AGENT_EVENTS_HEARTBEAT_EVENT). */
const HEARTBEAT_EVENT = 'heartbeat';
const DATA_CHANNELS = ['notification', 'agent_message', 'agent_question', 'supervisor_decision'];
/** Include tabs this worker does not control yet (first load, before claim). */
const CLIENT_QUERY = { type: 'window', includeUncontrolled: true };

/**
 * @typedef {'connected' | 'connecting' | 'disconnected'} ConnectionStatus
 * @typedef {{
 *   scope: string,
 *   eventSource: EventSource | null,
 *   backoff: number,
 *   reconnectTimer: ReturnType<typeof setTimeout> | null,
 *   stableTimer: ReturnType<typeof setTimeout> | null,
 *   status: ConnectionStatus,
 * }} Connection
 */

/** Client id → the scope that client subscribed to. @type {Map<string, string>} */
const subscribers = new Map();
/** Scope → its SSE connection. @type {Map<string, Connection>} */
const connections = new Map();

// --- Lifecycle ---

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claiming fires `controllerchange` in every open tab, and each tab then
  // subscribes itself — so the worker never guesses who is listening.
  event.waitUntil(self.clients.claim());
});

// --- Client messaging ---

self.addEventListener('message', (event) => {
  const { type, runId } = event.data ?? {};
  const client = event.source;
  if (!client || typeof client.id !== 'string') return;

  if (type === 'subscribe') {
    subscribe(client, typeof runId === 'string' && runId ? runId : GLOBAL_SCOPE);
  } else if (type === 'unsubscribe') {
    unsubscribe(client.id);
  }
});

function subscribe(client, scope) {
  const previous = subscribers.get(client.id);
  subscribers.set(client.id, scope);
  if (previous !== undefined && previous !== scope) releaseScope(previous);

  const connection = connections.get(scope) ?? openConnection(scope);
  // Tell the (re-)subscribing tab where its stream stands right away.
  client.postMessage({ type: 'status', status: connection.status });
}

function unsubscribe(clientId) {
  const scope = subscribers.get(clientId);
  if (scope === undefined) return;
  subscribers.delete(clientId);
  releaseScope(scope);
}

/** Close a scope's connection once no subscriber references it. */
function releaseScope(scope) {
  for (const subscribed of subscribers.values()) {
    if (subscribed === scope) return;
  }
  const connection = connections.get(scope);
  if (!connection) return;
  connections.delete(scope);
  shutdown(connection);
}

// --- SSE connection management ---

/** @returns {Connection} */
function openConnection(scope) {
  /** @type {Connection} */
  const connection = {
    scope,
    eventSource: null,
    backoff: BASE_BACKOFF_MS,
    reconnectTimer: null,
    stableTimer: null,
    status: 'disconnected',
  };
  connections.set(scope, connection);
  connect(connection);
  return connection;
}

function connect(connection) {
  if (connection.eventSource || connections.get(connection.scope) !== connection) return;

  const url =
    connection.scope === GLOBAL_SCOPE
      ? STREAM_PATH
      : `${STREAM_PATH}?runId=${encodeURIComponent(connection.scope)}`;

  const eventSource = new EventSource(url);
  connection.eventSource = eventSource;
  setStatus(connection, 'connecting');

  eventSource.onopen = () => {
    setStatus(connection, 'connected');
    // Only reset backoff after connection is stable
    connection.stableTimer = setTimeout(() => {
      connection.stableTimer = null;
      connection.backoff = BASE_BACKOFF_MS;
    }, STABLE_CONNECTION_MS);
  };

  eventSource.onerror = () => {
    closeStream(connection);
    setStatus(connection, 'disconnected');

    // Don't reconnect a scope nobody listens to any more
    if (connections.get(connection.scope) !== connection) return;

    const delay = connection.backoff;
    connection.backoff = Math.min(delay * 2, MAX_BACKOFF_MS);
    connection.reconnectTimer = setTimeout(() => {
      connection.reconnectTimer = null;
      connect(connection);
    }, delay);
  };

  // Spec 093 — collaboration & supervision event channels ride alongside
  // notifications. Clients receiving these messages can rely on `data` being
  // the matching StreamedAgentEvent envelope (kind set on the server side).
  for (const channel of DATA_CHANNELS) {
    eventSource.addEventListener(channel, (event) => {
      /** @type {unknown} */
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      broadcast(connection.scope, { type: channel, data });
    });
  }

  // Relayed without payload: it only proves the worker and its stream live.
  eventSource.addEventListener(HEARTBEAT_EVENT, () => {
    broadcast(connection.scope, { type: HEARTBEAT_EVENT });
  });
}

function shutdown(connection) {
  if (connection.reconnectTimer !== null) {
    clearTimeout(connection.reconnectTimer);
    connection.reconnectTimer = null;
  }
  closeStream(connection);
  connection.status = 'disconnected';
}

function closeStream(connection) {
  if (connection.stableTimer !== null) {
    clearTimeout(connection.stableTimer);
    connection.stableTimer = null;
  }
  if (connection.eventSource) {
    connection.eventSource.close();
    connection.eventSource = null;
  }
}

// --- Helpers ---

function setStatus(connection, status) {
  connection.status = status;
  broadcast(connection.scope, { type: 'status', status });
}

/**
 * Post `message` to every live tab subscribed to `scope`, and drop subscribers
 * whose tab no longer exists (closed without sending `unsubscribe`).
 */
async function broadcast(scope, message) {
  const clients = await self.clients.matchAll(CLIENT_QUERY);
  const liveIds = new Set(clients.map((client) => client.id));

  for (const clientId of [...subscribers.keys()]) {
    if (!liveIds.has(clientId)) unsubscribe(clientId);
  }

  for (const client of clients) {
    if (subscribers.get(client.id) === scope) client.postMessage(message);
  }
}
