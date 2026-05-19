/**
 * `shep bedrock ship --app <id>` command tests.
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

import { createBedrockShipCommand } from '../../../../src/presentation/cli/commands/bedrock/ship.command.js';

describe('shep bedrock ship', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('returns a Commander Command instance named "ship"', () => {
    const cmd = createBedrockShipCommand();
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('ship');
  });

  it('requires --app option', () => {
    const cmd = createBedrockShipCommand();
    const appOpt = cmd.options.find((o) => o.long === '--app');
    expect(appOpt).toBeDefined();
  });

  it('dispatches RunBedrockLifecycleUseCase with action=Ship', async () => {
    mockUseCase.execute.mockResolvedValue({
      action: BedrockLifecycleAction.Ship,
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const cmd = createBedrockShipCommand();
    await cmd.parseAsync(['--app', 'app-99'], { from: 'user' });

    const arg = mockUseCase.execute.mock.calls[0][0];
    expect(arg.applicationId).toBe('app-99');
    expect(arg.action).toBe(BedrockLifecycleAction.Ship);
  });

  it('reports the bedrock exit code on success', async () => {
    mockUseCase.execute.mockResolvedValue({
      action: BedrockLifecycleAction.Ship,
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    const cmd = createBedrockShipCommand();
    await cmd.parseAsync(['--app', 'app-99'], { from: 'user' });

    const allOutput = [
      ...mockMessages.success.mock.calls,
      ...mockMessages.info.mock.calls,
      ...mockMessages.log.mock.calls,
    ]
      .map((c) => String(c[0]))
      .join('\n');
    expect(allOutput).toMatch(/exit code.*0/i);
    expect(process.exitCode).toBeUndefined();
  });

  it('sets process.exitCode on non-zero exit and surfaces the code', async () => {
    mockUseCase.execute.mockResolvedValue({
      action: BedrockLifecycleAction.Ship,
      stdout: '',
      stderr: 'bad',
      exitCode: 7,
    });
    const cmd = createBedrockShipCommand();
    await cmd.parseAsync(['--app', 'app-99'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const allOutput = [...mockMessages.error.mock.calls, ...mockMessages.warning.mock.calls]
      .map((c) => String(c[0]))
      .join('\n');
    expect(allOutput).toMatch(/exit code.*7/i);
  });
});
