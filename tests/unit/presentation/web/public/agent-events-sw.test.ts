/**
 * Behaviour tests for the agent-events Service Worker script.
 *
 * The SW is a plain script served from `public/`, so it is loaded here into a
 * fresh `vm` context with a fake `self` (clients, lifecycle events) and a fake
 * `EventSource`, then driven through the same messages real tabs send.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { AGENT_EVENTS_HEARTBEAT_EVENT } from '../../../../../src/presentation/web/lib/agent-event-stream.js';

const SW_SOURCE = readFileSync(
  resolve(__dirname, '../../../../../src/presentation/web/public/agent-events-sw.js'),
  'utf-8'
);

/** Mirrors BASE_BACKOFF_MS in agent-events-sw.js. */
const BASE_BACKOFF_MS = 1000;
const GLOBAL_STREAM_URL = '/api/agent-events';

type Listener = (event: { data: string }) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(name: string, data: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }
}

interface FakeClient {
  id: string;
  postMessage: ReturnType<typeof vi.fn>;
}

interface SwHarness {
  open(id: string): FakeClient;
  close(id: string): void;
  send(client: FakeClient, data: unknown): void;
  activate(): Promise<void>;
  flush(): Promise<void>;
}

function loadServiceWorker(): SwHarness {
  const handlers = new Map<string, ((event: unknown) => void)[]>();
  const windows = new Map<string, FakeClient>();

  const self = {
    addEventListener(type: string, handler: (event: unknown) => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => [...windows.values()]),
    },
  };

  runInNewContext(SW_SOURCE, {
    self,
    EventSource: FakeEventSource,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    encodeURIComponent,
    JSON,
    Map,
    Set,
    Math,
    Promise,
  });

  const dispatch = (type: string, event: unknown) => {
    for (const handler of handlers.get(type) ?? []) handler(event);
  };
  const flush = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

  return {
    open(id) {
      const client = { id, postMessage: vi.fn() };
      windows.set(id, client);
      return client;
    },
    close(id) {
      windows.delete(id);
    },
    send(client, data) {
      dispatch('message', { data, source: client });
    },
    async activate() {
      let pending: Promise<unknown> = Promise.resolve();
      dispatch('activate', {
        waitUntil: (p: Promise<unknown>) => {
          pending = p;
        },
      });
      await pending;
      await flush();
    },
    flush,
  };
}

const openStreams = () => FakeEventSource.instances.filter((es) => !es.closed);
const messagesOf = (client: FakeClient) =>
  client.postMessage.mock.calls.map(([message]) => message as { type: string });

describe('agent-events service worker', () => {
  let sw: SwHarness;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    sw = loadServiceWorker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes the stream once every tab that re-subscribed after activation has left', async () => {
    const a = sw.open('a');
    const b = sw.open('b');
    await sw.activate();
    // Each page's controllerchange handler subscribes after the SW claims it.
    sw.send(a, { type: 'subscribe' });
    sw.send(b, { type: 'subscribe' });
    await sw.flush();

    sw.send(a, { type: 'unsubscribe' });
    sw.send(b, { type: 'unsubscribe' });
    await sw.flush();

    expect(openStreams()).toHaveLength(0);
  });

  it('counts a repeated subscribe from the same tab once', async () => {
    const a = sw.open('a');
    sw.send(a, { type: 'subscribe' });
    sw.send(a, { type: 'subscribe' });
    await sw.flush();
    expect(openStreams()).toHaveLength(1);

    sw.send(a, { type: 'unsubscribe' });
    await sw.flush();

    expect(openStreams()).toHaveLength(0);
  });

  it('gives each runId its own stream and routes events only to its tabs', async () => {
    const a = sw.open('a');
    const b = sw.open('b');
    sw.send(a, { type: 'subscribe', runId: 'run-a' });
    sw.send(b, { type: 'subscribe', runId: 'run-b' });
    await sw.flush();

    const urls = openStreams().map((es) => es.url);
    expect(urls).toEqual([`${GLOBAL_STREAM_URL}?runId=run-a`, `${GLOBAL_STREAM_URL}?runId=run-b`]);

    const streamA = openStreams()[0];
    streamA.emit('notification', { featureId: 'f-a' });
    await sw.flush();

    expect(messagesOf(a)).toContainEqual({ type: 'notification', data: { featureId: 'f-a' } });
    expect(messagesOf(b).filter((m) => m.type === 'notification')).toHaveLength(0);
  });

  it('prunes a tab that closed without unsubscribing and then drops the stream', async () => {
    const a = sw.open('a');
    sw.send(a, { type: 'subscribe' });
    await sw.flush();
    const [stream] = openStreams();

    // The tab is killed — no unsubscribe message ever arrives.
    sw.close('a');
    stream.emit(AGENT_EVENTS_HEARTBEAT_EVENT, {});
    await sw.flush();

    expect(stream.closed).toBe(true);
    expect(openStreams()).toHaveLength(0);
  });

  it('forwards the server heartbeat so pages can detect a silent worker', async () => {
    const a = sw.open('a');
    sw.send(a, { type: 'subscribe' });
    await sw.flush();

    openStreams()[0].emit(AGENT_EVENTS_HEARTBEAT_EVENT, {});
    await sw.flush();

    expect(messagesOf(a)).toContainEqual({ type: AGENT_EVENTS_HEARTBEAT_EVENT });
  });

  it('reconnects a dropped stream after the backoff while subscribers remain', async () => {
    const a = sw.open('a');
    sw.send(a, { type: 'subscribe' });
    await sw.flush();
    const [first] = openStreams();

    first.onerror?.();
    await sw.flush();
    expect(openStreams()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS);
    expect(openStreams()).toHaveLength(1);
    expect(openStreams()[0]).not.toBe(first);
  });

  it('does not open a stream on activation before any tab subscribes', async () => {
    sw.open('a');
    await sw.activate();

    expect(openStreams()).toHaveLength(0);
  });
});
