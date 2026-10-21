/**
 * Web Server Service
 *
 * Manages the Next.js programmatic server lifecycle.
 * Starts the web UI in the same Node.js process as the CLI,
 * sharing the DI container and application layer.
 *
 * Supports both development (dev: true) and production (dev: false) modes.
 * In production mode, Next.js serves the pre-built .next output.
 */

import { injectable } from 'tsyringe';
import next from 'next';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import type { IWebServerService } from '../../application/ports/output/services/web-server-service.interface.js';
import { IS_WINDOWS } from '../platform.js';
import { createRequestListener } from './http-request-listener.js';
import { createUpgradeListener } from './http-upgrade-listener.js';
import { readGuardPolicy } from './web-auth/guard-policy.js';
import type { GuardPolicy } from './web-auth/request-guard.js';

type NextApp = ReturnType<typeof next>;

/** Environment variable requesting a non-default listen address. */
export const BIND_HOST_ENV = 'SHEP_BIND_HOST';

/** Explicit opt-in required before the daemon leaves the loopback interface. */
export const ALLOW_PUBLIC_BIND_ENV = 'SHEP_ALLOW_PUBLIC_BIND';

/**
 * Environment variable the service publishes so the Next.js middleware can
 * validate Host headers against the port actually in use (the CLI picks a
 * free port at startup, so it is not a constant).
 */
export const WEB_PORT_ENV = 'SHEP_WEB_PORT';

/** Value that turns an opt-in environment flag on. */
export const ENV_FLAG_ON = '1';

/** The address the daemon binds to unless told otherwise. */
export const DEFAULT_BIND_HOST = 'localhost';

/** Addresses that keep the daemon reachable only from this machine. */
export const LOOPBACK_BIND_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;

export interface ResolvedBindHost {
  host: string;
  /** Non-null when the operator should be told what happened. */
  warning: string | null;
}

/**
 * Decide which interface to listen on.
 *
 * The control center spawns shells, installs tools and holds the user's
 * GitHub token, so leaving loopback is a deliberate, dangerous act. A
 * requested public bind is refused unless `SHEP_ALLOW_PUBLIC_BIND=1` is also
 * set, and even then it is announced.
 */
export function resolveBindHost(
  requested: string | undefined,
  allowPublic: boolean
): ResolvedBindHost {
  const host = requested?.trim();
  if (!host) {
    return { host: DEFAULT_BIND_HOST, warning: null };
  }

  if ((LOOPBACK_BIND_HOSTS as readonly string[]).includes(host.toLowerCase())) {
    return { host, warning: null };
  }

  if (!allowPublic) {
    return {
      host: DEFAULT_BIND_HOST,
      warning:
        `${BIND_HOST_ENV}=${host} was ignored: the Shep control center can start shells and ` +
        `install software, so it only listens on ${DEFAULT_BIND_HOST}. Set ` +
        `${ALLOW_PUBLIC_BIND_ENV}=${ENV_FLAG_ON} to override.`,
    };
  }

  return {
    host,
    warning:
      `${ALLOW_PUBLIC_BIND_ENV}=${ENV_FLAG_ON}: the Shep control center is listening on ${host}. ` +
      `Anyone who can reach this address can run commands as this user.`,
  };
}

export interface WebServerDeps {
  createNextApp: typeof next;
  createHttpServer: typeof http.createServer;
  /** Guard policy applied to WebSocket upgrades (they bypass the middleware). */
  readUpgradePolicy: () => GuardPolicy;
}

const defaultDeps: WebServerDeps = {
  createNextApp: next,
  createHttpServer: http.createServer,
  readUpgradePolicy: readGuardPolicy,
};

/**
 * Resolve the web UI directory path.
 * Works in both development (src/) and production (dist/) contexts.
 *
 * Priority order matters — when the same workspace has BOTH a dev
 * source tree AND a built `web/` bundle alongside `dist/`, we must
 * prefer the production bundle when it is reached from `dist/` so that
 * `node dist/src/presentation/cli/index.js ui` actually runs in prod
 * mode (no HMR, no compile badge, pre-built routes). Otherwise the
 * workspace-dev fallback would silently downgrade prod launches to
 * dev mode because `<root>/src/presentation/web/next.config.ts`
 * always exists in a dev checkout.
 *
 * Layouts this function handles:
 *
 *   Source (`pnpm dev:cli`): import.meta.dirname =
 *     <root>/packages/core/src/infrastructure/services/
 *     → 5 `..` + `src/presentation/web/` = <root>/src/presentation/web/
 *
 *   Built CLI in workspace (`node dist/.../ui`), prod `web/` NOT built:
 *     <root>/dist/packages/core/src/infrastructure/services/
 *     → 6 `..` + `src/presentation/web/` = <root>/src/presentation/web/
 *     (dev source fallback, kept for the "only built the CLI" loop)
 *
 *   Built CLI in workspace, prod `web/` ALREADY built (`pnpm build:release`):
 *     <root>/dist/packages/core/src/infrastructure/services/
 *     → 6 `..` + `web/` = <root>/web/
 *     (picked BEFORE the workspace-dev fallback)
 *
 *   Published npm install: same 6-up `web/` resolution.
 */
export function resolveWebDir(): { dir: string; dev: boolean } {
  // 1. Dev source when running via tsx from `packages/core/src/...`.
  //    This file physically lives under `src/` so 5 `..` reach the
  //    repository root; the workspace-dev and production branches
  //    never fire in this mode because they need 6 `..`.
  const devDir = path.resolve(import.meta.dirname, '../../../../../src/presentation/web');
  if (fs.existsSync(path.join(devDir, 'next.config.ts'))) {
    return { dir: devDir, dev: true };
  }

  // 2. Production `web/` bundle alongside `dist/` — take it if the
  //    Next.js build output exists. This MUST be checked before the
  //    workspace-dev fallback so `node dist/.../ui` runs in prod mode
  //    inside a full dev checkout (where both `web/` and
  //    `src/presentation/web/` exist).
  const prodDir = path.resolve(import.meta.dirname, '../../../../../../web');
  if (fs.existsSync(path.join(prodDir, '.next'))) {
    return { dir: prodDir, dev: false };
  }

  // 3. Workspace-dev fallback: built CLI in `dist/`, but no prod `web/`
  //    bundle assembled yet. This is the fast "rebuilt just the CLI"
  //    inner loop — we reuse the dev source tree so the UI still works
  //    without re-running `pnpm build:web:prod`.
  const workspaceDevDir = path.resolve(
    import.meta.dirname,
    '../../../../../../src/presentation/web'
  );
  if (fs.existsSync(path.join(workspaceDevDir, 'next.config.ts'))) {
    return { dir: workspaceDevDir, dev: true };
  }

  throw new Error(
    `Web UI directory not found. Ensure the web UI is built (pnpm build:web).\n` +
      `  Searched:\n` +
      `    dev:  ${devDir} (next.config.ts: ${fs.existsSync(path.join(devDir, 'next.config.ts'))})\n` +
      `    prod: ${prodDir} (.next: ${fs.existsSync(path.join(prodDir, '.next'))})\n` +
      `    workspace-dev fallback: ${workspaceDevDir} (next.config.ts: ${fs.existsSync(path.join(workspaceDevDir, 'next.config.ts'))})\n` +
      `  import.meta.dirname: ${import.meta.dirname}`
  );
}

@injectable()
export class WebServerService implements IWebServerService {
  private app: NextApp | null = null;
  private server: http.Server | null = null;
  private isShuttingDown = false;
  private readonly deps: WebServerDeps;

  constructor(deps: Partial<WebServerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * Start the Next.js web server.
   * @param port - Port to listen on
   * @param dir - Path to the Next.js web package directory
   * @param dev - Whether to run in development mode (default: auto-detect)
   */
  async start(port: number, dir: string, dev = true): Promise<void> {
    // On Windows, Next.js uses path.relative(CWD, dir) internally then
    // reconstructs with path.join(CWD, relative). When CWD and dir are on
    // different drives (e.g. D:\project vs C:\...\web), path.relative returns
    // the absolute path (can't compute relative across drives), and path.join
    // produces a mangled path like D:\project\C:\...\web\. Fix by ensuring
    // CWD is on the same drive as dir.
    if (IS_WINDOWS) {
      const getDriveLetter = (p: string) => p.match(/^[a-zA-Z]:/)?.[0]?.toUpperCase();
      const cwdDrive = getDriveLetter(process.cwd());
      const dirDrive = getDriveLetter(dir);
      if (cwdDrive && dirDrive && cwdDrive !== dirDrive) {
        process.chdir(dir);
      }
    }

    // Bind to SHEP_BIND_HOST (default: localhost), refusing anything outside
    // the loopback interface without an explicit opt-in. Next's own hostname
    // is always 'localhost' so it generates correct relative URLs regardless
    // of which interface the HTTP server actually listens on.
    const { host: bindHost, warning } = resolveBindHost(
      process.env[BIND_HOST_ENV],
      process.env[ALLOW_PUBLIC_BIND_ENV] === ENV_FLAG_ON
    );
    if (warning) {
      // eslint-disable-next-line no-console
      console.warn(`[WebServerService] ${warning}`);
    }

    // Publish the port so `middleware.ts` can reject Host headers that name a
    // different port (DNS rebinding defence).
    process.env[WEB_PORT_ENV] = String(port);

    const app = this.deps.createNextApp({
      dev,
      dir,
      port,
      hostname: 'localhost',
    });

    const handle = app.getRequestHandler();
    await app.prepare();

    this.app = app;

    await new Promise<void>((resolve, reject) => {
      const server = this.deps.createHttpServer(createRequestListener(handle));

      server.on('error', reject);

      // Forward WebSocket upgrades to Next.js for HMR/Fast Refresh. Only dev
      // mode has an HMR socket, and an upgrade never reaches the middleware,
      // so the listener re-applies its Host/Origin/token guard itself.
      if (dev) {
        server.on(
          'upgrade',
          createUpgradeListener(app.getUpgradeHandler(), {
            readPolicy: this.deps.readUpgradePolicy,
          })
        );
      }

      server.listen(port, bindHost, () => {
        this.server = server;
        resolve();
      });
    });
  }

  /**
   * Gracefully stop the server.
   * Destroys active connections to avoid hanging on keep-alive sockets.
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    try {
      if (this.server) {
        // Destroy all active connections so server.close() resolves immediately
        // Without this, HTTP keep-alive connections keep the server hanging
        this.server.closeAllConnections();
        await new Promise<void>((resolve) => {
          this.server!.close(() => resolve());
        });
        this.server = null;
      }

      if (this.app) {
        await this.app.close();
        this.app = null;
      }
    } finally {
      this.isShuttingDown = false;
    }
  }
}
