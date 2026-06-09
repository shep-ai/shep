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
 *   - Reconnect on disconnect with a small delay
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

const RECONNECT_DELAY_MS = 5_000;
const PING_INTERVAL_MS = 25_000;

export type TunnelRequestHandler = (
  request: DecodedTunnelRequest
) => Promise<TunnelRequestResponse>;

/** Factory allowing tests to substitute an in-memory transport. */
export type WebSocketFactory = (url: string, options: ClientOptions) => WebSocket;

const defaultFactory: WebSocketFactory = (url, options) => new WebSocket(url, options);

export interface MessagingTunnelAdapterDeps {
  gatewayUrl: string;
  accessToken: string;
  deviceId: string;
  /** Route IDs to claim after tunnel.connected arrives. */
  routeIds: string[];
  webSocketFactory?: WebSocketFactory;
}

function headersArrayToRecord(pairs?: [string, string][]): Record<string, string> {
  if (!pairs) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of pairs) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function headersRecordToArray(record?: Record<string, string>): [string, string][] | undefined {
  if (!record) return undefined;
  return Object.entries(record);
}

function base64Encode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

function base64Decode(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}

export class MessagingTunnelAdapter {
  private ws: WebSocket | null = null;
  private requestHandler: TunnelRequestHandler | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private stopping = false;
  private readonly activatedRoutes = new Set<string>();
  private readonly factory: WebSocketFactory;

  constructor(private readonly deps: MessagingTunnelAdapterDeps) {
    this.factory = deps.webSocketFactory ?? defaultFactory;
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
   * Open the tunnel and resolve once the server has emitted tunnel.connected.
   * Reconnects are silent (fire-and-forget).
   */
  async connect(): Promise<void> {
    if (this.connected || this.stopping) return;

    const base = this.deps.gatewayUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    const url = `${base}/gateway/v1/integrations/tunnel/connect?device_id=${encodeURIComponent(
      this.deps.deviceId
    )}`;

    const ws = this.factory(url, {
      headers: { authorization: `Bearer ${this.deps.accessToken}` },
    });
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onceOpen = () => {
        ws.off('error', onceError);
        resolve();
      };
      const onceError = (err: Error) => {
        ws.off('open', onceOpen);
        reject(err);
      };
      ws.once('open', onceOpen);
      ws.once('error', onceError);
    });

    ws.on('message', (data: RawData) => {
      this.handleRawFrame(data).catch(() => {
        // Malformed frames are non-fatal.
      });
    });
    ws.on('close', () => this.handleClose());
    ws.on('error', () => {
      // Errors also trigger close; avoid duplicate handling.
    });

    this.connected = true;
    this.startPing();
  }

  /** Close the tunnel permanently (no auto-reconnect). */
  async disconnect(): Promise<void> {
    this.stopping = true;
    this.stopPing();
    this.clearReconnect();
    this.activatedRoutes.clear();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.connected = false;
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

  private handleClose(): void {
    this.connected = false;
    this.activatedRoutes.clear();
    this.stopPing();
    if (!this.stopping) {
      this.scheduleReconnect();
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch {
          // ignore
        }
      }
    }, PING_INTERVAL_MS);
    this.pingTimer.unref?.();
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Will retry on the next close event.
      });
    }, RECONNECT_DELAY_MS);
    this.reconnectTimer.unref?.();
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
