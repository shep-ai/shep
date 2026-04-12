/**
 * Port Service Unit Tests
 *
 * Tests for port availability checking and auto-increment logic.
 *
 * TDD Phase: RED
 */

import { describe, it, expect } from 'vitest';
import net from 'node:net';

import {
  isPortAvailable,
  findAvailablePort,
  DEFAULT_PORT,
  MAX_PORT_ATTEMPTS,
} from '@/infrastructure/services/port.service.js';

describe('Port Service', () => {
  describe('isPortAvailable', () => {
    it('should return true for an available port', async () => {
      // Use a port in the ephemeral range that's less likely to be in use
      // Get OS to pick an available one by binding to port 0
      const server = net.createServer();
      const availablePort = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            resolve(addr.port);
          }
        });
      });
      server.close();

      // Give the OS a moment to release the port
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await isPortAvailable(availablePort);
      expect(result).toBe(true);
    });

    it('should return false for an occupied port', async () => {
      // Bind a port to make it occupied
      const server = net.createServer();
      await new Promise<void>((resolve) => {
        server.listen(49153, '127.0.0.1', () => resolve());
      });

      try {
        const result = await isPortAvailable(49153);
        expect(result).toBe(false);
      } finally {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
    });
  });

  describe('findAvailablePort', () => {
    it('should return the start port when it is available', async () => {
      const port = await findAvailablePort(49154);
      expect(port).toBe(49154);
    });

    it('should skip occupied ports and find the next available one', async () => {
      // Occupy ports 49155 and 49156
      const servers: net.Server[] = [];
      for (const p of [49155, 49156]) {
        const server = net.createServer();
        await new Promise<void>((resolve) => {
          server.listen(p, '127.0.0.1', () => resolve());
        });
        servers.push(server);
      }

      try {
        const port = await findAvailablePort(49155);
        // Must skip at least past the two occupied ports; other system processes
        // may occupy additional ports so we check >= rather than exact equality.
        expect(port).toBeGreaterThanOrEqual(49157);
      } finally {
        await Promise.all(
          servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve())))
        );
      }
    });

    it('should throw after max attempts are exhausted', async () => {
      // Occupy a contiguous range of ports
      const startPort = 49160;
      const servers: net.Server[] = [];
      for (let p = startPort; p < startPort + 3; p++) {
        const server = net.createServer();
        await new Promise<void>((resolve) => {
          server.listen(p, '127.0.0.1', () => resolve());
        });
        servers.push(server);
      }

      try {
        await expect(findAvailablePort(startPort, 3)).rejects.toThrow(/No available port found/);
      } finally {
        await Promise.all(
          servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve())))
        );
      }
    });

    it('should validate port range - reject ports below 1024', async () => {
      await expect(findAvailablePort(80)).rejects.toThrow(/port/i);
    });

    it('should validate port range - reject ports above 65535', async () => {
      await expect(findAvailablePort(70000)).rejects.toThrow(/port/i);
    });
  });

  describe('constants', () => {
    it('should export DEFAULT_PORT as 4050', () => {
      expect(DEFAULT_PORT).toBe(4050);
    });

    it('should export MAX_PORT_ATTEMPTS as 20', () => {
      expect(MAX_PORT_ATTEMPTS).toBe(20);
    });
  });
});
