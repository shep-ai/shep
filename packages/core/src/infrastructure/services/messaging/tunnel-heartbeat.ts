/**
 * Tunnel heartbeat — detects half-open sockets.
 *
 * A socket whose peer vanished without a FIN (NAT timeout, laptop sleep,
 * gateway crash) never emits 'close'. Every TUNNEL_PING_INTERVAL_MS a ping
 * is sent; if no pong arrives within TUNNEL_PONG_TIMEOUT_MS the socket is
 * declared dead via `onDead`.
 */

import WebSocket from 'ws';
import { TUNNEL_PING_INTERVAL_MS, TUNNEL_PONG_TIMEOUT_MS } from './tunnel-reconnect-policy.js';

export class TunnelHeartbeat {
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  /** Start pinging `ws`; `onDead` fires once when a pong is overdue. */
  start(ws: WebSocket, onDead: () => void): void {
    this.stop();
    this.pingTimer = setInterval(() => {
      if (this.pongTimer || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.ping();
      } catch {
        // A throwing ping is handled like a missing pong below.
      }
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        onDead();
      }, TUNNEL_PONG_TIMEOUT_MS);
      this.pongTimer.unref?.();
    }, TUNNEL_PING_INTERVAL_MS);
    this.pingTimer.unref?.();
  }

  /** The peer answered — the socket is alive. */
  pongReceived(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  stop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.pongReceived();
  }
}
