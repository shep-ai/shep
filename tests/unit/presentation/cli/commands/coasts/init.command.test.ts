import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ICoastsService } from '@/application/ports/output/services/coasts-service.interface.js';
import type { PrerequisiteCheckResult } from '@/application/ports/output/services/coasts-service.interface.js';

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

function allMet(): PrerequisiteCheckResult {
  return {
    coastBinary: true,
    docker: true,
    coastdRunning: true,
    allMet: true,
    missingMessages: [],
  };
}

function prerequisitesFailed(messages: string[]): PrerequisiteCheckResult {
  return {
    coastBinary: false,
    docker: false,
    coastdRunning: false,
    allMet: false,
    missingMessages: messages,
  };
}

// Mock the DI container
const mockContainer = {
  resolve: vi.fn(),
};
vi.mock('@/infrastructure/di/container.js', () => ({
  container: mockContainer,
}));

// Mock the CLI UI helpers to suppress output
vi.mock('@cli/presentation/cli/ui/index.js', () => ({
  messages: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    newline: vi.fn(),
  },
  spinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

// Import the function under test
const { createInitCommand } = await import('@cli/presentation/cli/commands/coasts/init.command.js');

describe('shep coasts init', () => {
  let mockService: ICoastsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockCoastsService();
    mockContainer.resolve.mockReturnValue(mockService);
  });

  it('calls generateCoastfile then build on success', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(false);
    vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMet());
    vi.mocked(mockService.generateCoastfile).mockResolvedValue('/repo/Coastfile');
    vi.mocked(mockService.build).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['node', 'test', '--force']);

    expect(mockService.generateCoastfile).toHaveBeenCalled();
    expect(mockService.build).toHaveBeenCalled();
  });

  it('exits with error when prerequisites fail', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(false);
    vi.mocked(mockService.checkPrerequisites).mockResolvedValue(
      prerequisitesFailed(['coast binary not found'])
    );

    const cmd = createInitCommand();
    await cmd.parseAsync(['node', 'test', '--force']);

    expect(mockService.generateCoastfile).not.toHaveBeenCalled();
  });

  it('skips generation when Coastfile exists and --force not set', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);

    const cmd = createInitCommand();
    await cmd.parseAsync(['node', 'test']);

    expect(mockService.hasCoastfile).toHaveBeenCalled();
    expect(mockService.generateCoastfile).not.toHaveBeenCalled();
  });

  it('regenerates when Coastfile exists and --force is set', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
    vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMet());
    vi.mocked(mockService.generateCoastfile).mockResolvedValue('/repo/Coastfile');
    vi.mocked(mockService.build).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['node', 'test', '--force']);

    expect(mockService.generateCoastfile).toHaveBeenCalled();
    expect(mockService.build).toHaveBeenCalled();
  });
});
