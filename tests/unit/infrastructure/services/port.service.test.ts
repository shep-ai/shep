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

/**
 * Ports are always chosen by the OS, never hard-coded: Windows runners reserve
 * parts of the dynamic range (49152+) per boot, so a fixed port can fail to
 * bind with EACCES on one run and work on the next.
 */
const PORT_RANGE_ATTEMPTS = 20;

function listenOn(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function closeAll(servers: net.Server[]): Promise<void[]> {
  return Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
}

/** A port the OS just reported free (released again before returning). */
async function freePort(): Promise<number> {
  const server = await listenOn(0);
  const address = server.address();
  await closeAll([server]);
  if (!address || typeof address === 'string') throw new Error('No TCP address assigned');
  return address.port;
}

/** Bind `count` consecutive ports; retries from a new OS-chosen base if any bind fails. */
async function occupyConsecutivePorts(
  count: number
): Promise<{ start: number; servers: net.Server[] }> {
  for (let attempt = 0; attempt < PORT_RANGE_ATTEMPTS; attempt++) {
    const start = await freePort();
    if (start + count - 1 > 65535) continue;
    const servers: net.Server[] = [];
    try {
      for (let offset = 0; offset < count; offset++) {
        servers.push(await listenOn(start + offset));
      }
      return { start, servers };
    } catch {
      await closeAll(servers);
    }
  }
  throw new Error(`Could not bind ${count} consecutive ports`);
}

describe('Port Service', () => {
  describe('isPortAvailable', () => {
    it('should return true for an available port', async () => {
      const availablePort = await freePort();

      const result = await isPortAvailable(availablePort);
      expect(result).toBe(true);
    });

    it('should return false for an occupied port', async () => {
      const { start, servers } = await occupyConsecutivePorts(1);

      try {
        const result = await isPortAvailable(start);
        expect(result).toBe(false);
      } finally {
        await closeAll(servers);
      }
    });
  });

  describe('findAvailablePort', () => {
    it('should return the start port when it is available', async () => {
      const startPort = await freePort();

      const port = await findAvailablePort(startPort);
      expect(port).toBe(startPort);
    });

    it('should skip occupied ports and find the next available one', async () => {
      const { start, servers } = await occupyConsecutivePorts(2);

      try {
        const port = await findAvailablePort(start);
        // Must skip at least past the two occupied ports; other system processes
        // may occupy additional ports so we check >= rather than exact equality.
        expect(port).toBeGreaterThanOrEqual(start + 2);
      } finally {
        await closeAll(servers);
      }
    });

    it('should throw after max attempts are exhausted', async () => {
      const { start, servers } = await occupyConsecutivePorts(3);

      try {
        await expect(findAvailablePort(start, 3)).rejects.toThrow(/No available port found/);
      } finally {
        await closeAll(servers);
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
