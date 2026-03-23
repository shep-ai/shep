/**
 * Coasts Dev Server Startup & Shutdown Tests
 *
 * Integration tests for the dev-server Coasts branching logic.
 * Tests startCoastsDevServer() and shutdownCoasts() with mocked ICoastsService —
 * no real coast CLI, Docker, or coastd daemon required.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ICoastsService,
  PrerequisiteCheckResult,
} from '@/application/ports/output/services/coasts-service.interface.js';

// Mock console to capture log output without polluting test runner
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(vi.fn()),
  error: vi.spyOn(console, 'error').mockImplementation(vi.fn()),
  warn: vi.spyOn(console, 'warn').mockImplementation(vi.fn()),
};

// Dynamic import to load after mocks are in place
const { startCoastsDevServer, shutdownCoasts } = await import(
  '@cli/presentation/web/coasts-dev-server.js'
);

function createMockCoastsService(overrides: Partial<ICoastsService> = {}): ICoastsService {
  return {
    checkPrerequisites: vi.fn<ICoastsService['checkPrerequisites']>(),
    build: vi.fn<ICoastsService['build']>(),
    run: vi.fn<ICoastsService['run']>(),
    stop: vi.fn<ICoastsService['stop']>(),
    lookup: vi.fn<ICoastsService['lookup']>(),
    isRunning: vi.fn<ICoastsService['isRunning']>(),
    checkout: vi.fn<ICoastsService['checkout']>(),
    generateCoastfile: vi.fn<ICoastsService['generateCoastfile']>(),
    hasCoastfile: vi.fn<ICoastsService['hasCoastfile']>(),
    ...overrides,
  };
}

function allPrerequisitesMet(): PrerequisiteCheckResult {
  return {
    coastBinary: true,
    docker: true,
    coastdRunning: true,
    allMet: true,
    missingMessages: [],
  };
}

function prerequisitesMissing(
  missing: Partial<Record<'coastBinary' | 'docker' | 'coastdRunning', boolean>>
): PrerequisiteCheckResult {
  const coastBinary = missing.coastBinary ?? true;
  const docker = missing.docker ?? true;
  const coastdRunning = missing.coastdRunning ?? true;
  const missingMessages: string[] = [];
  if (!coastBinary) missingMessages.push('coast binary not found on PATH');
  if (!docker) missingMessages.push('Docker daemon is not reachable');
  if (!coastdRunning) missingMessages.push('coastd daemon is not running');
  return {
    coastBinary,
    docker,
    coastdRunning,
    allMet: coastBinary && docker && coastdRunning,
    missingMessages,
  };
}

describe('startCoastsDevServer', () => {
  const workDir = '/repos/my-project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only checks prerequisites — does not build, run, or generate', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.checkPrerequisites).mockResolvedValue(allPrerequisitesMet());

    await startCoastsDevServer(service, workDir);

    expect(service.checkPrerequisites).toHaveBeenCalledWith(workDir);
    expect(service.build).not.toHaveBeenCalled();
    expect(service.run).not.toHaveBeenCalled();
    expect(service.hasCoastfile).not.toHaveBeenCalled();
    expect(service.generateCoastfile).not.toHaveBeenCalled();
  });

  it('throws when prerequisites are not met (missing coast binary)', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.checkPrerequisites).mockResolvedValue(
      prerequisitesMissing({ coastBinary: false })
    );

    await expect(startCoastsDevServer(service, workDir)).rejects.toThrow(/prerequisites not met/i);
  });

  it('throws when Docker is not running', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.checkPrerequisites).mockResolvedValue(
      prerequisitesMissing({ docker: false })
    );

    await expect(startCoastsDevServer(service, workDir)).rejects.toThrow(/prerequisites not met/i);
  });

  it('throws when coastd daemon is not running', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.checkPrerequisites).mockResolvedValue(
      prerequisitesMissing({ coastdRunning: false })
    );

    await expect(startCoastsDevServer(service, workDir)).rejects.toThrow(/prerequisites not met/i);
  });

  it('includes missing prerequisite messages in error', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.checkPrerequisites).mockResolvedValue(
      prerequisitesMissing({ coastBinary: false, docker: false, coastdRunning: false })
    );

    await expect(startCoastsDevServer(service, workDir)).rejects.toThrow(/coast binary not found/);
  });

  it('logs [dev-server:coasts] prefix messages during startup', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.checkPrerequisites).mockResolvedValue(allPrerequisitesMet());

    await startCoastsDevServer(service, workDir);

    const logCalls = consoleSpy.log.mock.calls.map((c) => c[0]);
    const coastsLogs = logCalls.filter(
      (msg) => typeof msg === 'string' && msg.includes('[dev-server:coasts]')
    );
    expect(coastsLogs.length).toBeGreaterThanOrEqual(2); // prerequisites check + ready
  });
});

describe('shutdownCoasts', () => {
  const workDir = '/repos/my-project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls stop() on the coastsService', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.stop).mockResolvedValue(undefined);

    await shutdownCoasts(service, workDir);

    expect(service.stop).toHaveBeenCalledWith(workDir);
  });

  it('does nothing when coastsService is null (bare mode)', async () => {
    // Should not throw
    await expect(shutdownCoasts(null, workDir)).resolves.toBeUndefined();
  });

  it('catches and logs errors from stop() without rethrowing', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.stop).mockRejectedValue(new Error('stop failed'));

    // Should not throw
    await expect(shutdownCoasts(service, workDir)).resolves.toBeUndefined();

    expect(consoleSpy.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to stop'),
      expect.any(Error)
    );
  });

  it('logs [dev-server:coasts] prefix during shutdown', async () => {
    const service = createMockCoastsService();
    vi.mocked(service.stop).mockResolvedValue(undefined);

    await shutdownCoasts(service, workDir);

    const logCalls = consoleSpy.log.mock.calls.map((c) => c[0]);
    const coastsLogs = logCalls.filter(
      (msg) => typeof msg === 'string' && msg.includes('[dev-server:coasts]')
    );
    expect(coastsLogs.length).toBeGreaterThanOrEqual(1);
  });
});
