/**
 * Messaging Tunnel Adapter Unit Tests
 *
 * Drives the real Commands.com gateway tunnel protocol (tunnel.connected /
 * tunnel.activate / tunnel.request / tunnel.response). Uses a fake in-memory
 * WebSocket that emits events synchronously and records outbound frames.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { MessagingTunnelAdapter } from '@/infrastructure/services/messaging/messaging-tunnel.adapter.js';
import {
  computeReconnectDelay,
  TUNNEL_RECONNECT_BASE_DELAY_MS,
  TUNNEL_RECONNECT_MAX_DELAY_MS,
  TUNNEL_RECONNECT_JITTER_RATIO,
  TUNNEL_PING_INTERVAL_MS,
  TUNNEL_PONG_TIMEOUT_MS,
} from '@/infrastructure/services/messaging/tunnel-reconnect-policy.js';
import type {
  TunnelActivateFrame,
  TunnelConnectedFrame,
  TunnelRequestFrame,
  TunnelResponseFrame,
  TunnelActivateResultFrame,
} from '@/infrastructure/services/messaging/tunnel-protocol.js';

/**
 * Minimal stand-in for the `ws` library's WebSocket. Supports on/off/once,
 * send, close, and exposes a readyState compatible with WebSocket.OPEN.
 */
class FakeWebSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN;
  public url: string;
  public options: unknown;
  public sent: string[] = [];
  public closed = false;
  public terminated = false;
  public pings = 0;

  constructor(url: string, options: unknown) {
    super();
    this.url = url;
    this.options = options;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  ping(): void {
    this.pings += 1;
  }

  terminate(): void {
    this.terminated = true;
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }

  /** A failed upgrade (gateway down, 401): error then close, never open. */
  failUpgrade(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit('error', new Error('Unexpected server response: 401'));
    this.emit('close');
  }

  close(): void {
    this.closed = true;
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }

  // Helpers for tests to simulate server events
  emitOpen(): void {
    this.emit('open');
  }

  emitFrame(frame: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(frame), 'utf8'));
  }

  parseSent(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

function connectedFrame(deviceId = 'dev-1'): TunnelConnectedFrame {
  return { type: 'tunnel.connected', device_id: deviceId };
}

function activateResultFrame(routeId: string, ok = true): TunnelActivateResultFrame {
  return {
    type: 'tunnel.activate.result',
    results: [
      ok
        ? { route_id: routeId, status: 'active' }
        : {
            route_id: routeId,
            status: 'rejected',
            error: { code: 'route_not_found', message: 'Route not found' },
          },
    ],
  };
}

describe('MessagingTunnelAdapter', () => {
  let fakeWs: FakeWebSocket;
  let adapter: MessagingTunnelAdapter;

  function buildAdapter(routeIds: string[] = ['route-telegram']) {
    adapter = new MessagingTunnelAdapter({
      gatewayUrl: 'http://gateway.test',
      getAccessToken: async () => 'tok-abc',
      deviceId: 'dev-1',
      routeIds,
      webSocketFactory: (url, options) => {
        fakeWs = new FakeWebSocket(url, options);
        return fakeWs as unknown as WebSocket;
      },
    });
  }

  beforeEach(() => {
    buildAdapter();
  });

  it('builds the WebSocket URL with ws:// scheme and device_id query, and bearer header', async () => {
    const connectPromise = adapter.connect();
    // Resolve the open promise
    setImmediate(() => fakeWs.emitOpen());
    await connectPromise;

    expect(fakeWs.url).toBe(
      'ws://gateway.test/gateway/v1/integrations/tunnel/connect?device_id=dev-1'
    );
    expect((fakeWs.options as { headers: Record<string, string> }).headers).toMatchObject({
      authorization: 'Bearer tok-abc',
    });
    expect(adapter.isConnected()).toBe(true);
  });

  it('converts https to wss', async () => {
    adapter = new MessagingTunnelAdapter({
      gatewayUrl: 'https://gw.example.com',
      getAccessToken: async () => 't',
      deviceId: 'd',
      routeIds: ['r'],
      webSocketFactory: (url, options) => {
        fakeWs = new FakeWebSocket(url, options);
        return fakeWs as unknown as WebSocket;
      },
    });
    const connectPromise = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await connectPromise;
    expect(fakeWs.url.startsWith('wss://gw.example.com/')).toBe(true);
  });

  it('sends a single batched tunnel.activate with all routes after tunnel.connected', async () => {
    buildAdapter(['route-telegram', 'route-whatsapp']);
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;

    fakeWs.emitFrame(connectedFrame());

    const sent = fakeWs.parseSent() as TunnelActivateFrame[];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'tunnel.activate',
      routes: ['route-telegram', 'route-whatsapp'],
    });
  });

  it('marks routes activated after tunnel.activate.result ok', async () => {
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;

    fakeWs.emitFrame(connectedFrame());
    fakeWs.emitFrame(activateResultFrame('route-telegram'));

    expect(adapter.isRouteActivated('route-telegram')).toBe(true);
  });

  it('does not mark route activated if the server returns ok:false', async () => {
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;

    fakeWs.emitFrame(connectedFrame());
    fakeWs.emitFrame(activateResultFrame('route-telegram', false));

    expect(adapter.isRouteActivated('route-telegram')).toBe(false);
  });

  it('dispatches tunnel.request to the handler and sends tunnel.response with status + body', async () => {
    const handler = vi.fn().mockResolvedValue({
      status: 200,
      body: 'ok',
      headers: { 'content-type': 'text/plain' },
    });
    adapter.onRequest(handler);

    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;
    fakeWs.emitFrame(connectedFrame());
    fakeWs.parseSent(); // flush activate

    const request: TunnelRequestFrame = {
      type: 'tunnel.request',
      request_id: 'req-1',
      route_id: 'route-telegram',
      method: 'POST',
      path: '/hook',
      headers: [['content-type', 'application/json']],
      body_base64: Buffer.from('{"x":1}', 'utf8').toString('base64'),
    };

    fakeWs.sent.length = 0;
    fakeWs.emitFrame(request);
    await new Promise((r) => setImmediate(r));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        routeId: 'route-telegram',
        method: 'POST',
        path: '/hook',
        body: '{"x":1}',
        headers: { 'content-type': 'application/json' },
      })
    );

    const responses = fakeWs.parseSent() as TunnelResponseFrame[];
    const resp = responses.find((f) => f.type === 'tunnel.response');
    expect(resp).toBeDefined();
    expect(resp).toMatchObject({
      request_id: 'req-1',
      status: 200,
      headers: [['content-type', 'text/plain']],
    });
    expect(Buffer.from(resp!.body_base64!, 'base64').toString('utf8')).toBe('ok');
  });

  it('returns 503 if no handler is registered', async () => {
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;
    fakeWs.emitFrame(connectedFrame());
    fakeWs.sent.length = 0;

    fakeWs.emitFrame({
      type: 'tunnel.request',
      request_id: 'r1',
      route_id: 'route-telegram',
      method: 'POST',
      path: '/',
    });

    await new Promise((r) => setImmediate(r));
    const responses = fakeWs.parseSent() as TunnelResponseFrame[];
    expect(responses[0]).toMatchObject({
      type: 'tunnel.response',
      request_id: 'r1',
      status: 503,
    });
  });

  it('returns 500 if the handler throws', async () => {
    adapter.onRequest(async () => {
      throw new Error('boom');
    });
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;
    fakeWs.emitFrame(connectedFrame());
    fakeWs.sent.length = 0;

    fakeWs.emitFrame({
      type: 'tunnel.request',
      request_id: 'r2',
      route_id: 'route-telegram',
      method: 'GET',
      path: '/',
    });

    await new Promise((r) => setImmediate(r));
    const responses = fakeWs.parseSent() as TunnelResponseFrame[];
    expect(responses[0]).toMatchObject({ status: 500, request_id: 'r2' });
  });

  it('removes a route from activated set on tunnel.route_deactivated', async () => {
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;
    fakeWs.emitFrame(connectedFrame());
    fakeWs.emitFrame(activateResultFrame('route-telegram'));
    expect(adapter.isRouteActivated('route-telegram')).toBe(true);

    fakeWs.emitFrame({
      type: 'tunnel.route_deactivated',
      route_id: 'route-telegram',
      reason: 'revoked',
    });
    expect(adapter.isRouteActivated('route-telegram')).toBe(false);
  });

  it('disconnect() closes the socket and stops reconnecting', async () => {
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;

    await adapter.disconnect();
    expect(fakeWs.closed).toBe(true);
    expect(adapter.isConnected()).toBe(false);
  });

  it('silently drops malformed frames', async () => {
    const p = adapter.connect();
    setImmediate(() => fakeWs.emitOpen());
    await p;
    fakeWs.emit('message', Buffer.from('not json', 'utf8'));
    fakeWs.emit('message', Buffer.from(JSON.stringify({ type: 'unknown.frame' }), 'utf8'));
    // Should not crash; nothing sent back.
    expect(fakeWs.sent).toHaveLength(0);
  });

  describe('reconnect, backoff, token refresh and liveness', () => {
    let sockets: FakeWebSocket[];
    let tokens: string[];
    let tokenCalls: number;

    function buildReconnectingAdapter(
      getAccessToken: () => Promise<string> = async () => `tok-${++tokenCalls}`
    ) {
      sockets = [];
      tokens = [];
      adapter = new MessagingTunnelAdapter({
        gatewayUrl: 'http://gateway.test',
        getAccessToken,
        deviceId: 'dev-1',
        routeIds: ['route-telegram'],
        // No jitter: every delay is exactly the capped exponential step.
        random: () => 0,
        webSocketFactory: (url, options) => {
          const ws = new FakeWebSocket(url, options);
          tokens.push((options as { headers: Record<string, string> }).headers.authorization);
          sockets.push(ws);
          fakeWs = ws;
          return ws as unknown as WebSocket;
        },
      });
    }

    /** Flush the async token fetch so the factory has been called. */
    async function flushMicrotasks(): Promise<void> {
      await vi.advanceTimersByTimeAsync(0);
    }

    beforeEach(() => {
      vi.useFakeTimers();
      tokenCalls = 0;
      buildReconnectingAdapter();
    });

    afterEach(async () => {
      await adapter.disconnect();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });

    it('computeReconnectDelay doubles from the base, caps at the max, and jitters downward', () => {
      expect(computeReconnectDelay(0, () => 0)).toBe(TUNNEL_RECONNECT_BASE_DELAY_MS);
      expect(computeReconnectDelay(1, () => 0)).toBe(TUNNEL_RECONNECT_BASE_DELAY_MS * 2);
      expect(computeReconnectDelay(2, () => 0)).toBe(TUNNEL_RECONNECT_BASE_DELAY_MS * 4);
      expect(computeReconnectDelay(1_000, () => 0)).toBe(TUNNEL_RECONNECT_MAX_DELAY_MS);
      expect(computeReconnectDelay(0, () => 1)).toBe(
        TUNNEL_RECONNECT_BASE_DELAY_MS * (1 - TUNNEL_RECONNECT_JITTER_RATIO)
      );
    });

    it('retries after a failed upgrade (error + close before open) instead of dying', async () => {
      const first = adapter.connect();
      await flushMicrotasks();
      expect(sockets).toHaveLength(1);
      sockets[0].failUpgrade();
      await expect(first).rejects.toThrow(/401/);

      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS - 1);
      expect(sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(2);

      sockets[1].emitOpen();
      await flushMicrotasks();
      expect(adapter.isConnected()).toBe(true);
    });

    it('backs off exponentially across consecutive failures', async () => {
      adapter.connect().catch(() => undefined);
      await flushMicrotasks();
      sockets[0].failUpgrade();
      await flushMicrotasks();

      // attempt 1 after base
      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS);
      expect(sockets).toHaveLength(2);
      sockets[1].failUpgrade();
      await flushMicrotasks();

      // attempt 2 after 2x base — probe just inside
      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS * 2 - 1);
      expect(sockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(3);
    });

    it('fetches a fresh access token for every connection attempt', async () => {
      adapter.connect().catch(() => undefined);
      await flushMicrotasks();
      sockets[0].failUpgrade();
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS);

      expect(tokens).toEqual(['Bearer tok-1', 'Bearer tok-2']);
    });

    it('schedules a retry when the token fetch itself fails', async () => {
      let calls = 0;
      buildReconnectingAdapter(async () => {
        calls += 1;
        if (calls === 1) throw new Error('gateway down');
        return 'tok-ok';
      });

      await expect(adapter.connect()).rejects.toThrow(/gateway down/);
      expect(sockets).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS);
      expect(sockets).toHaveLength(1);
      expect(tokens).toEqual(['Bearer tok-ok']);
    });

    it('resets the backoff after a successful open, then reconnects on close', async () => {
      adapter.connect().catch(() => undefined);
      await flushMicrotasks();
      sockets[0].failUpgrade();
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS);
      sockets[1].emitOpen();
      await flushMicrotasks();
      expect(adapter.isConnected()).toBe(true);

      sockets[1].close();
      expect(adapter.isConnected()).toBe(false);
      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS - 1);
      expect(sockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(3);
    });

    it('terminates a half-open socket when no pong arrives, then reconnects', async () => {
      const p = adapter.connect();
      await flushMicrotasks();
      sockets[0].emitOpen();
      await p;

      await vi.advanceTimersByTimeAsync(TUNNEL_PING_INTERVAL_MS);
      expect(sockets[0].pings).toBe(1);

      // Just inside the pong deadline the socket is still considered alive.
      await vi.advanceTimersByTimeAsync(TUNNEL_PONG_TIMEOUT_MS - 1);
      expect(sockets[0].terminated).toBe(false);
      expect(adapter.isConnected()).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      expect(sockets[0].terminated).toBe(true);
      expect(adapter.isConnected()).toBe(false);

      // Reconnect happens one backoff step later, not at the timeout.
      expect(sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_BASE_DELAY_MS);
      expect(sockets).toHaveLength(2);
    });

    it('keeps a socket that answers pings', async () => {
      const p = adapter.connect();
      await flushMicrotasks();
      sockets[0].emitOpen();
      await p;

      await vi.advanceTimersByTimeAsync(TUNNEL_PING_INTERVAL_MS);
      sockets[0].emit('pong');
      await vi.advanceTimersByTimeAsync(TUNNEL_PONG_TIMEOUT_MS);
      expect(sockets[0].terminated).toBe(false);
      expect(adapter.isConnected()).toBe(true);
    });

    it('disconnect() cancels a pending reconnect', async () => {
      adapter.connect().catch(() => undefined);
      await flushMicrotasks();
      sockets[0].failUpgrade();
      await flushMicrotasks();
      expect(vi.getTimerCount()).toBe(1);

      await adapter.disconnect();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(TUNNEL_RECONNECT_MAX_DELAY_MS);
      expect(sockets).toHaveLength(1);
    });
  });
});
