/**
 * Dev Server Coasts Integration Tests
 *
 * Tests for the Coasts startup path and graceful shutdown in dev-server.ts.
 * Verifies branching logic based on the coastsDevServer feature flag,
 * prerequisite checking, Coastfile generation, and shutdown behavior.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ICoastsService,
  PrerequisiteCheckResult,
  CoastInstance,
} from '@/application/ports/output/services/coasts-service.interface.js';

/** Creates a mock ICoastsService with all methods stubbed. */
function createMockCoastsService(): ICoastsService {
  return {
    checkPrerequisites: vi.fn(),
    build: vi.fn(),
    run: vi.fn(),
    stop: vi.fn(),
    lookup: vi.fn(),
    isRunning: vi.fn(),
    checkout: vi.fn(),
    getInstallationPrompt: vi.fn(),
    generateCoastfile: vi.fn(),
    hasCoastfile: vi.fn(),
  };
}

function allMetResult(): PrerequisiteCheckResult {
  return {
    coastBinary: true,
    docker: true,
    coastdRunning: true,
    allMet: true,
    missingMessages: [],
  };
}

function failedResult(messages: string[]): PrerequisiteCheckResult {
  return {
    coastBinary: false,
    docker: false,
    coastdRunning: false,
    allMet: false,
    missingMessages: messages,
  };
}

function coastInstance(port = 3000): CoastInstance {
  return { port, url: `http://localhost:${port}` };
}

// Import the function under test — extracted from dev-server.ts for testability
import { startCoastsDevServer, shutdownCoasts } from '@/presentation/web/coasts-dev-server.js';

describe('Coasts Dev Server Startup', () => {
  let mockService: ICoastsService;
  const workDir = '/repos/my-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockCoastsService();
  });

  describe('startCoastsDevServer', () => {
    it('runs prerequisite check as the first step', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
      vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
      vi.mocked(mockService.build).mockResolvedValue(undefined);
      vi.mocked(mockService.run).mockResolvedValue(coastInstance());

      await startCoastsDevServer(mockService, workDir);

      expect(mockService.checkPrerequisites).toHaveBeenCalledWith(workDir);
    });

    it('throws when prerequisites are not met', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(
        failedResult(['coast binary not found', 'Docker daemon not reachable'])
      );

      await expect(startCoastsDevServer(mockService, workDir)).rejects.toThrow(/prerequisites/i);
    });

    it('does not call build/run when prerequisites fail', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(
        failedResult(['coast binary not found'])
      );

      await expect(startCoastsDevServer(mockService, workDir)).rejects.toThrow();

      expect(mockService.build).not.toHaveBeenCalled();
      expect(mockService.run).not.toHaveBeenCalled();
    });

    it('throws when no Coastfile exists', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
      vi.mocked(mockService.hasCoastfile).mockResolvedValue(false);

      await expect(startCoastsDevServer(mockService, workDir)).rejects.toThrow(
        /no coastfile found/i
      );

      expect(mockService.generateCoastfile).not.toHaveBeenCalled();
      expect(mockService.build).not.toHaveBeenCalled();
    });

    it('proceeds with build and run when Coastfile exists', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
      vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
      vi.mocked(mockService.build).mockResolvedValue(undefined);
      vi.mocked(mockService.run).mockResolvedValue(coastInstance());

      await startCoastsDevServer(mockService, workDir);

      expect(mockService.generateCoastfile).not.toHaveBeenCalled();
    });

    it('calls coast build then coast run in sequence', async () => {
      const callOrder: string[] = [];
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
      vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
      vi.mocked(mockService.build).mockImplementation(async () => {
        callOrder.push('build');
      });
      vi.mocked(mockService.run).mockImplementation(async () => {
        callOrder.push('run');
        return coastInstance();
      });

      await startCoastsDevServer(mockService, workDir);

      expect(callOrder).toEqual(['build', 'run']);
    });

    it('returns the CoastInstance from coast run', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
      vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
      vi.mocked(mockService.build).mockResolvedValue(undefined);
      vi.mocked(mockService.run).mockResolvedValue(coastInstance(8080));

      const result = await startCoastsDevServer(mockService, workDir);

      expect(result.port).toBe(8080);
      expect(result.url).toBe('http://localhost:8080');
    });

    it('propagates coast build errors', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
      vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
      vi.mocked(mockService.build).mockRejectedValue(
        new Error('coast build failed: invalid Coastfile')
      );

      await expect(startCoastsDevServer(mockService, workDir)).rejects.toThrow(
        'coast build failed'
      );
    });

    it('propagates coast run errors', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
      vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
      vi.mocked(mockService.build).mockResolvedValue(undefined);
      vi.mocked(mockService.run).mockRejectedValue(new Error('coast run failed'));

      await expect(startCoastsDevServer(mockService, workDir)).rejects.toThrow('coast run failed');
    });
  });

  describe('shutdownCoasts', () => {
    it('calls coastsService.stop() with workDir', async () => {
      vi.mocked(mockService.stop).mockResolvedValue(undefined);

      await shutdownCoasts(mockService, workDir);

      expect(mockService.stop).toHaveBeenCalledWith(workDir);
    });

    it('does not throw when coastsService.stop() fails', async () => {
      vi.mocked(mockService.stop).mockRejectedValue(new Error('stop failed'));

      await expect(shutdownCoasts(mockService, workDir)).resolves.toBeUndefined();
    });

    it('does nothing when service is null', async () => {
      await expect(shutdownCoasts(null, workDir)).resolves.toBeUndefined();
    });
  });
});
