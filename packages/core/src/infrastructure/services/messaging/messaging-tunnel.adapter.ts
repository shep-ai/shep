/**
 * Messaging Tunnel Adapter
 *
 * Manages the WebSocket tunnel connection to the Commands.com Gateway and
 * translates its binary/text frames into a presentation-agnostic callback
 * for the consuming messaging service.
 *
 * Protocol reference:
 *   https://github.com/Commands-com/gateway/blob/main/internal/gateway/integrations_tunnel.go
 *
 * Responsibilities:
 *   - Open an authenticated WebSocket (Bearer token on the upgrade headers)
 *   - Handle tunnel.connected → auto-activate the configured routes
 *   - Decode incoming tunnel.request frames and dispatch to `onRequest`
 *   - Send tunnel.response frames back with the handler's reply
 *   - Reconnect after ANY failure — a failed upgrade (gateway down, 401), a
 *     token fetch error, a close, or a missed pong — with capped exponential
 *     backoff plus jitter, fetching a fresh access token on every attempt
 *   - Detect half-open sockets: every ping must be answered by a pong within
 *     TUNNEL_PONG_TIMEOUT_MS or the socket is terminated and replaced
 */

import WebSocket, { type ClientOptions, type RawData } from 'ws';
import type {
  DecodedTunnelRequest,
  TunnelActivateFrame,
  TunnelActivateResultFrame,
  TunnelConnectedFrame,
  TunnelErrorFrame,
  TunnelInboundFrame,
  TunnelRequestFrame,
  TunnelRequestResponse,
  TunnelResponseFrame,
  TunnelRouteDeactivatedFrame,
} from './tunnel-protocol.js';
import {
  base64Decode,
  base64Encode,
  headersArrayToRecord,
  headersRecordToArray,
} from './tunnel-codec.js';
import { computeReconnectDelay } from './tunnel-reconnect-policy.js';
import { TunnelHeartbeat } from './tunnel-heartbeat.js';

export type TunnelRequestHandler = (
  request: DecodedTunnelRequest
) => Promise<TunnelRequestResponse>;

/** Factory allowing tests to substitute an in-memory transport. */
export type WebSocketFactory = (url: string, options: ClientOptions) => WebSocket;

const defaultFactory: WebSocketFactory = (url, options) => new WebSocket(url, options);

export interface MessagingTunnelAdapterDeps {
  gatewayUrl: string;
  /**
   * Fetches a bearer token for the upgrade request. Called on EVERY
   * connection attempt so an expired token is never reused.
   */
  getAccessToken: () => Promise<string>;
  deviceId: string;
  /** Route IDs to claim after tunnel.connected arrives. */
  routeIds: string[];
  webSocketFactory?: WebSocketFactory;
  /** Jitter source in [0, 1). Defaults to Math.random. */
  random?: () => number;
}

export class MessagingTunnelAdapter {
  private ws: WebSocket | null = null;
  private requestHandler: TunnelRequestHandler | null = null;
  private readonly heartbeat = new TunnelHeartbeat();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private connected = false;
  private connecting = false;
  private stopping = false;
  private readonly activatedRoutes = new Set<string>();
  private readonly factory: WebSocketFactory;
  private readonly random: () => number;

  constructor(private readonly deps: MessagingTunnelAdapterDeps) {
    this.factory = deps.webSocketFactory ?? defaultFactory;
    this.random = deps.random ?? Math.random;
  }

  /** Register a handler for inbound tunnel.request frames. */
  onRequest(handler: TunnelRequestHandler): void {
    this.requestHandler = handler;
  }

  /** Whether the WebSocket tunnel is currently open. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Whether the given route has been activated on the tunnel. */
  isRouteActivated(routeId: string): boolean {
    return this.activatedRoutes.has(routeId);
  }

  /**
   * Open the tunnel and resolve once the WebSocket is open. A failure
   * rejects AND schedules a backoff retry, so the caller may treat the
   * initial failure as non-fatal.
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting || this.stopping) return;
    this.connecting = true;
    try {
      await this.openSocket();
      this.reconnectAttempt = 0;
    } catch (err) {
      this.scheduleReconnect();
      throw err;
    } finally {
      this.connecting = false;
    }
  }

  /** Close the tunnel permanently (no auto-reconnect). */
  async disconnect(): Promise<void> {
    this.stopping = true;
    this.heartbeat.stop();
    this.clearReconnect();
    this.activatedRoutes.clear();

    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }

  private async openSocket(): Promise<void> {
    const accessToken = await this.deps.getAccessToken();
    if (this.stopping) return;

    const base = this.deps.gatewayUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    const url = `${base}/gateway/v1/integrations/tunnel/connect?device_id=${encodeURIComponent(
      this.deps.deviceId
    )}`;

    const ws = this.factory(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    this.ws = ws;

    // Attach the lifecycle listeners BEFORE the upgrade completes: a failed
    // upgrade emits error + close and never open, and an EventEmitter with
    // no 'error' listener throws.
    ws.on('error', () => {
      // Surfaced through the open promise or the close handler.
    });
    ws.on('close', () => this.handleSocketClose(ws));
    ws.on('pong', () => this.heartbeat.pongReceived());
    ws.on('message', (data: RawData) => {
      this.handleRawFrame(data).catch(() => {
        // Malformed frames are non-fatal.
      });
    });

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        ws.off('open', onceOpen);
        ws.off('error', onceError);
        ws.off('close', onceClose);
      };
      const onceOpen = () => {
        cleanup();
        resolve();
      };
      const onceError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onceClose = () => {
        cleanup();
        reject(new Error('Tunnel closed before the connection opened'));
      };
      ws.once('open', onceOpen);
      ws.once('error', onceError);
      ws.once('close', onceClose);
    });

    if (this.stopping || this.ws !== ws) return;
    this.connected = true;
    this.heartbeat.start(ws, () => this.handleLivenessTimeout(ws));
  }

  private async handleRawFrame(data: RawData): Promise<void> {
    const raw = typeof data === 'string' ? data : data.toString('utf8');
    let frame: TunnelInboundFrame;
    try {
      frame = JSON.parse(raw) as TunnelInboundFrame;
    } catch {
      return;
    }

    switch (frame.type) {
      case 'tunnel.connected':
        this.handleConnected(frame);
        return;
      case 'tunnel.activate.result':
        this.handleActivateResult(frame);
        return;
      case 'tunnel.request':
        await this.handleRequest(frame);
        return;
      case 'tunnel.route_deactivated':
        this.handleRouteDeactivated(frame);
        return;
      case 'tunnel.error':
        this.handleProtocolError(frame);
        return;
      default:
        // Unknown frame — silently drop per gateway forward-compat policy.
        return;
    }
  }

  private handleConnected(_frame: TunnelConnectedFrame): void {
    // Auto-activate every configured route. The gateway expects a single
    // batched frame with a `routes` array — sending one-at-a-time with
    // `route_id` is silently ignored.
    if (this.deps.routeIds.length === 0) return;
    this.sendFrame({
      type: 'tunnel.activate',
      routes: [...this.deps.routeIds],
    } satisfies TunnelActivateFrame);
  }

  private handleActivateResult(frame: TunnelActivateResultFrame): void {
    // Gateway returns "active" for newly-activated routes. Treat any
    // non-rejected status as success to be forward-compatible.
    for (const entry of frame.results ?? []) {
      if (entry.status && entry.status !== 'rejected') {
        this.activatedRoutes.add(entry.route_id);
      }
    }
  }

  private handleRouteDeactivated(frame: TunnelRouteDeactivatedFrame): void {
    this.activatedRoutes.delete(frame.route_id);
  }

  private handleProtocolError(_frame: TunnelErrorFrame): void {
    // No-op — recoverable errors are surfaced through reconnection.
  }

  private async handleRequest(frame: TunnelRequestFrame): Promise<void> {
    if (!this.requestHandler) {
      this.sendFrame({
        type: 'tunnel.response',
        request_id: frame.request_id,
        status: 503,
      } satisfies TunnelResponseFrame);
      return;
    }

    const decoded: DecodedTunnelRequest = {
      requestId: frame.request_id,
      routeId: frame.route_id,
      method: frame.method,
      path: frame.path,
      headers: headersArrayToRecord(frame.headers),
      body: frame.body_base64 ? base64Decode(frame.body_base64) : '',
    };

    let response: TunnelRequestResponse;
    try {
      response = await this.requestHandler(decoded);
    } catch {
      response = { status: 500 };
    }

    this.sendFrame({
      type: 'tunnel.response',
      request_id: frame.request_id,
      status: response.status,
      headers: headersRecordToArray(response.headers),
      body_base64: response.body ? base64Encode(response.body) : undefined,
    } satisfies TunnelResponseFrame);
  }

  private sendFrame(frame: TunnelActivateFrame | TunnelResponseFrame): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(frame));
    } catch {
      // ignore — close handler will reconnect
    }
  }

  /**
   * A socket that had opened went away. Pre-open failures are handled by
   * connect()'s catch, so only an established socket schedules here.
   */
  private handleSocketClose(ws: WebSocket): void {
    if (this.ws !== ws) return;
    this.ws = null;
    const wasConnected = this.connected;
    this.connected = false;
    this.activatedRoutes.clear();
    this.heartbeat.stop();
    if (wasConnected) {
      this.scheduleReconnect();
    }
  }

  /** No pong in time: the socket is half-open — replace it. */
  private handleLivenessTimeout(ws: WebSocket): void {
    try {
      ws.terminate();
    } catch {
      // ignore — we replace the socket regardless
    }
    // terminate() normally emits close; handleSocketClose is idempotent per socket.
    this.handleSocketClose(ws);
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    const delay = computeReconnectDelay(this.reconnectAttempt, this.random);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // A rejection has already scheduled the next attempt inside connect().
      this.connect().catch(() => undefined);
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
