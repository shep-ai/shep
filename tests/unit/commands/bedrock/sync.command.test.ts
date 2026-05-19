/**
 * `shep bedrock sync --app <id>` command tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { BedrockLifecycleAction } from '@/domain/generated/output.js';

const { mockUseCase, mockMessages } = vi.hoisted(() => ({
  mockUseCase: { execute: vi.fn() },
  mockMessages: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    newline: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: string) => {
      if (token === 'RunBedrockLifecycleUseCase') return mockUseCase;
      throw new Error(`Unexpected DI token: ${token}`);
    }),
  },
}));

vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
    success: (s: string) => s,
    error: (s: string) => s,
    warning: (s: string) => s,
    info: (s: string) => s,
  },
  fmt: { code: (s: string) => s, heading: (s: string) => s, label: (s: string) => s },
  renderListView: vi.fn(),
}));

import { createBedrockSyncCommand } from '../../../../src/presentation/cli/commands/bedrock/sync.command.js';

describe('shep bedrock sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('returns a Commander Command instance named "sync"', () => {
    const cmd = createBedrockSyncCommand();
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('sync');
  });

  it('requires --app option', () => {
    const cmd = createBedrockSyncCommand();
    const appOpt = cmd.options.find((o) => o.long === '--app');
    expect(appOpt).toBeDefined();
  });

  it('dispatches RunBedrockLifecycleUseCase with action=Sync', async () => {
    mockUseCase.execute.mockResolvedValue({
      action: BedrockLifecycleAction.Sync,
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const cmd = createBedrockSyncCommand();
    await cmd.parseAsync(['--app', 'app-42'], { from: 'user' });

    expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
    const arg = mockUseCase.execute.mock.calls[0][0];
    expect(arg.applicationId).toBe('app-42');
    expect(arg.action).toBe(BedrockLifecycleAction.Sync);
    expect(typeof arg.onProgress).toBe('function');
  });

  it('streams onProgress chunks to stdout', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockUseCase.execute.mockImplementation(async ({ onProgress }) => {
      onProgress?.({ stream: 'stdout', data: 'syncing\n' });
      return { action: BedrockLifecycleAction.Sync, stdout: 'syncing\n', stderr: '', exitCode: 0 };
    });

    const cmd = createBedrockSyncCommand();
    await cmd.parseAsync(['--app', 'app-42'], { from: 'user' });

    expect(writeSpy.mock.calls.map((c) => String(c[0])).join('')).toContain('syncing');
    writeSpy.mockRestore();
  });

  it('sets process.exitCode on non-zero exit', async () => {
    mockUseCase.execute.mockResolvedValue({
      action: BedrockLifecycleAction.Sync,
      stdout: '',
      stderr: '',
      exitCode: 3,
    });
    const cmd = createBedrockSyncCommand();
    await cmd.parseAsync(['--app', 'app-42'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });
});
