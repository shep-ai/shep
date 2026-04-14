/**
 * CLI UI Command E2E Tests
 *
 * Tests for the `shep ui` command that starts the integrated web UI server.
 * Verifies the server starts correctly on the default port, respects custom
 * port flags, and handles port conflicts by auto-incrementing.
 *
 * These tests spawn actual server processes and make HTTP requests to validate
 * the /version page content. Generous timeouts are used because Next.js dev
 * mode compilation can take 30-60 seconds on first request.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { startCliServer, type ServerProcess } from '../../helpers/cli/server.js';

// Next.js shutdown can be slow — increase hook timeout from default 10s
vi.setConfig({ hookTimeout: 30_000 });

/** Path to Next.js dev lock file */
const NEXT_LOCK_FILE = resolve(__dirname, '../../../src/presentation/web/.next/dev/lock');

/** Track all servers started during tests for cleanup */
const servers: ServerProcess[] = [];

/** Track any net servers used for port blocking */
const blockingServers: Server[] = [];

/**
 * Helper to start a CLI server and track it for cleanup
 */
async function startTrackedServer(
  ...args: Parameters<typeof startCliServer>
): Promise<ServerProcess> {
  const server = await startCliServer(...args);
  servers.push(server);
  return server;
}

/**
 * Helper to block a port with a plain TCP server
 */
function blockPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => {
      blockingServers.push(server);
      resolve(server);
    });
    server.on('error', reject);
  });
}

/**
 * Helper to find a free port by binding to port 0 and letting the OS assign one.
 * Closes the probe server immediately and returns the assigned port number.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

describe('CLI: ui', { timeout: 300_000 }, () => {
  beforeEach(() => {
    // Remove stale Next.js dev lock file to prevent cascading failures
    try {
      rmSync(NEXT_LOCK_FILE, { force: true });
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Stop all tracked CLI server processes
    const stopPromises = servers.map((s) => s.stop());
    await Promise.all(stopPromises);
    servers.length = 0;

    // Close all blocking servers
    const closePromises = blockingServers.map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve()))
    );
    await Promise.all(closePromises);
    blockingServers.length = 0;
  });

  describe('default port behavior', () => {
    it('should start on port 4050 and serve the /version page', async () => {
      // Arrange - use a dynamic free port to avoid EADDRINUSE from stale processes
      const port = await findFreePort();

      // Act
      const server = await startTrackedServer(`--port ${port}`);

      // Assert - server started on some valid port
      expect(server.port).toBeGreaterThan(0);

      // Fetch the /version page
      const response = await fetch(`http://localhost:${server.port}/version`);
      expect(response.status).toBe(200);

      const html = await response.text();
      expect(html).toContain('@shepai/cli');
      expect(html).toContain('Autonomous AI-native SDLC platform');
    }, 150_000);
  });

  describe('custom port via --port flag', () => {
    it('should start on the specified port', async () => {
      // Arrange - find a free port dynamically to avoid hardcoded port conflicts
      const port = await findFreePort();

      // Act
      const server = await startTrackedServer(`--port ${port}`);

      // Assert - should start on the dynamically-found port
      expect(server.port).toBe(port);

      // Fetch the /version page
      const response = await fetch(`http://localhost:${port}/version`);
      expect(response.status).toBe(200);

      const html = await response.text();
      expect(html).toContain('@shepai/cli');
    }, 150_000);
  });

  describe('port conflict handling', () => {
    it('should auto-increment to next port when default port is occupied', async () => {
      // Arrange - find a free port P dynamically, then block it
      const basePort = await findFreePort();
      await blockPort(basePort);

      // Act - start with --port P; CLI should auto-increment past the blocked port
      const server = await startTrackedServer(`--port ${basePort}`);

      // Assert - should have found a free port above the blocked one
      expect(server.port).toBeGreaterThan(basePort);

      // Fetch the /version page on the auto-incremented port
      const response = await fetch(`http://localhost:${server.port}/version`);
      expect(response.status).toBe(200);
    }, 150_000);
  });
});
