/**
 * `shep bedrock init --app <id>` command tests.
 *
 * Verifies the command resolves EnableBedrockForApplicationUseCase, passes
 * an onProgress callback that writes to stdout, and reports the exit code.
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
      if (token === 'EnableBedrockForApplicationUseCase') return mockUseCase;
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

import { createBedrockInitCommand } from '../../../../src/presentation/cli/commands/bedrock/init.command.js';

describe('shep bedrock init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('returns a Commander Command instance named "init"', () => {
    const cmd = createBedrockInitCommand();
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('init');
  });

  it('requires --app option', () => {
    const cmd = createBedrockInitCommand();
    const appOpt = cmd.options.find((o) => o.long === '--app');
    expect(appOpt).toBeDefined();
  });

  it('calls EnableBedrockForApplicationUseCase with applicationId and onProgress', async () => {
    mockUseCase.execute.mockResolvedValue({
      action: BedrockLifecycleAction.Init,
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    const cmd = createBedrockInitCommand();
    await cmd.parseAsync(['--app', 'app-123'], { from: 'user' });

    expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
    const arg = mockUseCase.execute.mock.calls[0][0];
    expect(arg.applicationId).toBe('app-123');
    expect(typeof arg.onProgress).toBe('function');
  });

  it('streams onProgress chunks to process.stdout', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockUseCase.execute.mockImplementation(async ({ onProgress }) => {
      onProgress?.({ stream: 'stdout', data: 'hello\n' });
      onProgress?.({ stream: 'stderr', data: 'warn\n' });
      return {
        action: BedrockLifecycleAction.Init,
        stdout: 'hello\n',
        stderr: 'warn\n',
        exitCode: 0,
      };
    });

    const cmd = createBedrockInitCommand();
    await cmd.parseAsync(['--app', 'app-123'], { from: 'user' });

    const written = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toContain('hello');
    expect(written).toContain('warn');
    writeSpy.mockRestore();
  });

  it('sets process.exitCode = 1 when bedrock exits non-zero', async () => {
    mockUseCase.execute.mockResolvedValue({
      action: BedrockLifecycleAction.Init,
      stdout: '',
      stderr: 'boom',
      exitCode: 2,
    });

    const cmd = createBedrockInitCommand();
    await cmd.parseAsync(['--app', 'app-123'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  it('pretty-prints typed domain errors with a remediation hint', async () => {
    class FakeBedrockBinaryMissingError extends Error {
      readonly code = 'BEDROCK_BINARY_MISSING';
      readonly remediation = 'Run `pipx ensurepath` and reopen your terminal.';
      constructor() {
        super('The `bedrock` binary is not on PATH');
        this.name = 'BedrockBinaryMissingError';
      }
    }
    mockUseCase.execute.mockRejectedValue(new FakeBedrockBinaryMissingError());

    const cmd = createBedrockInitCommand();
    await cmd.parseAsync(['--app', 'app-123'], { from: 'user' });

    expect(mockMessages.error).toHaveBeenCalled();
    const allInfoArgs = mockMessages.info.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allInfoArgs).toContain('pipx ensurepath');
    expect(process.exitCode).toBe(1);
  });
});
