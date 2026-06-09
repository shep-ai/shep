/**
 * Cloudflare Tunnel Service
 *
 * Manages a `cloudflared` quick-tunnel that exposes ONLY the webhook
 * API routes to the public internet via a random *.trycloudflare.com
 * subdomain.
 *
 * Uses the `cloudflared` npm package which handles binary installation
 * and provides a typed Tunnel API — no need for the user to install
 * cloudflared separately.
 *
 * Security: A lightweight proxy HTTP server is started on a random port
 * that only forwards requests matching the allowed path prefix
 * (/api/webhooks) to the main app. The tunnel connects to this proxy,
 * not the main app server. All other paths return 404.
 */

import { createServer, request as httpRequest } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type {
  ITunnelService,
  TunnelUrlChangeHandler,
} from '../../../application/ports/output/services/tunnel-service.interface.js';

const TAG = '[CloudflareTunnel]';
const STARTUP_TIMEOUT_MS = 30_000;
const ALLOWED_PATH_PREFIX = '/api/webhooks';

export interface CloudflareTunnelDeps {
  createTunnel: (origin: string) => TunnelLike | Promise<TunnelLike>;
}

export interface TunnelLike {
  on(event: 'url', handler: (url: string) => void): void;
  on(
    event: 'connected',
    handler: (connection: { id: string; ip: string; location: string }) => void
  ): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'exit', handler: (code: number | null, signal: string | null) => void): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
  stop(): void;
}

async function defaultCreateTunnel(origin: string): Promise<TunnelLike> {
  const { Tunnel } = await import('cloudflared');
  return Tunnel.quick(origin);
}

const defaultDeps: CloudflareTunnelDeps = {
  createTunnel: defaultCreateTunnel,
};

export class CloudflareTunnelService implements ITunnelService {
  private tunnel: TunnelLike | null = null;
  private proxyServer: Server | null = null;
  private publicUrl: string | null = null;
  private readonly urlChangeHandlers: TunnelUrlChangeHandler[] = [];
  private readonly deps: CloudflareTunnelDeps;

  constructor(deps: Partial<CloudflareTunnelDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async start(localPort: number): Promise<string> {
    if (this.tunnel) {
      throw new Error(`${TAG} Tunnel already running at ${this.publicUrl}`);
    }

    // Start a proxy server that only forwards webhook routes
    const proxyPort = await this.startProxyServer(localPort);

    let tunnel: TunnelLike;
    try {
      tunnel = await Promise.resolve(this.deps.createTunnel(`http://localhost:${proxyPort}`));
    } catch (err) {
      this.stopProxyServer();
      throw new Error(`${TAG} Failed to create tunnel: ${(err as Error).message}`);
    }

    this.tunnel = tunnel;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopTunnel();
        reject(new Error(`${TAG} Timed out waiting for tunnel URL (${STARTUP_TIMEOUT_MS}ms)`));
      }, STARTUP_TIMEOUT_MS);

      tunnel.on('url', (url: string) => {
        if (!this.publicUrl) {
          // First URL — startup complete
          this.publicUrl = url;
          clearTimeout(timeout);
          // eslint-disable-next-line no-console
          console.log(
            `${TAG} Tunnel ready: ${url} (proxying ${ALLOWED_PATH_PREFIX}/* to port ${localPort})`
          );
          resolve(url);
        } else if (url !== this.publicUrl) {
          // URL changed — reconnection with new subdomain
          const oldUrl = this.publicUrl;
          this.publicUrl = url;
          // eslint-disable-next-line no-console
          console.log(`${TAG} Tunnel URL changed: ${oldUrl} -> ${url}`);
          this.notifyUrlChange(url);
        }
      });

      tunnel.on('error', (err: Error) => {
        clearTimeout(timeout);
        this.tunnel = null;
        this.publicUrl = null;
        this.stopProxyServer();
        reject(new Error(`${TAG} Failed to start tunnel: ${err.message}`));
      });

      tunnel.on('exit', (code: number | null) => {
        clearTimeout(timeout);
        if (this.tunnel === tunnel) {
          this.tunnel = null;
          const wasRunning = this.publicUrl !== null;
          this.publicUrl = null;
          this.stopProxyServer();

          if (wasRunning) {
            // eslint-disable-next-line no-console
            console.log(`${TAG} Tunnel process exited (code ${code})`);
          } else {
            reject(new Error(`${TAG} cloudflared exited with code ${code} before producing a URL`));
          }
        }
      });
    });
  }

  async stop(): Promise<void> {
    this.stopTunnel();
    this.publicUrl = null;
  }

  getPublicUrl(): string | null {
    return this.publicUrl;
  }

  onUrlChange(handler: TunnelUrlChangeHandler): void {
    this.urlChangeHandlers.push(handler);
  }

  isRunning(): boolean {
    return this.tunnel !== null && this.publicUrl !== null;
  }

  /**
   * Start a lightweight HTTP proxy on a random port that only forwards
   * requests with paths starting with ALLOWED_PATH_PREFIX to the main app.
   * Everything else gets a 404.
   */
  private startProxyServer(targetPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? '';

        if (!url.startsWith(ALLOWED_PATH_PREFIX)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        // Proxy the request to the main app
        const proxyReq = httpRequest(
          {
            hostname: 'localhost',
            port: targetPort,
            path: url,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );

        proxyReq.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.warn(`${TAG} Proxy error: ${err.message}`);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ error: 'Bad gateway' }));
        });

        req.pipe(proxyReq);
      });

      // Listen on port 0 = OS assigns a random available port
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this.proxyServer = server;
          // eslint-disable-next-line no-console
          console.log(`${TAG} Webhook proxy listening on port ${addr.port}`);
          resolve(addr.port);
        } else {
          server.close();
          reject(new Error(`${TAG} Failed to start proxy server`));
        }
      });

      server.on('error', (err) => {
        reject(new Error(`${TAG} Proxy server error: ${err.message}`));
      });
    });
  }

  private stopProxyServer(): void {
    if (this.proxyServer) {
      this.proxyServer.close();
      this.proxyServer = null;
    }
  }

  private stopTunnel(): void {
    if (this.tunnel) {
      const tunnel = this.tunnel;
      this.tunnel = null;

      try {
        tunnel.stop();
      } catch {
        // Tunnel already stopped
      }
    }

    this.stopProxyServer();
  }

  private notifyUrlChange(newUrl: string): void {
    for (const handler of this.urlChangeHandlers) {
      try {
        const result = handler(newUrl);
        if (result instanceof Promise) {
          result.catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`${TAG} URL change handler failed:`, err);
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`${TAG} URL change handler threw:`, err);
      }
    }
  }
}
