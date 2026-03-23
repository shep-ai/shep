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

    it('does not build, run, or generate anything on startup', async () => {
      vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());

      await startCoastsDevServer(mockService, workDir);

      expect(mockService.build).not.toHaveBeenCalled();
      expect(mockService.run).not.toHaveBeenCalled();
      expect(mockService.hasCoastfile).not.toHaveBeenCalled();
      expect(mockService.generateCoastfile).not.toHaveBeenCalled();
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
