/**
 * Feature Promote Command Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureMode, SdlcLifecycle } from '@/domain/generated/output.js';

const { mockResolve, mockPromoteExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockPromoteExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
    success: (s: string) => s,
    brand: (s: string) => s,
  },
  messages: {
    newline: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  spinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

import { createPromoteCommand } from '../../../../../../src/presentation/cli/commands/feat/promote.command.js';

describe('createPromoteCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined as any;
    mockResolve.mockImplementation(() => ({ execute: mockPromoteExecute }));
  });

  it('should create a command named "promote"', () => {
    const cmd = createPromoteCommand();
    expect(cmd.name()).toBe('promote');
  });

  it('should call PromoteExplorationUseCase with Regular mode by default', async () => {
    mockPromoteExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Explore idea',
        mode: FeatureMode.Regular,
        lifecycle: SdlcLifecycle.Requirements,
      },
    });

    const cmd = createPromoteCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(mockPromoteExecute).toHaveBeenCalledWith({
      featureId: 'feat-001',
      targetMode: FeatureMode.Regular,
    });
  });

  it('should call PromoteExplorationUseCase with Fast mode when --fast is provided', async () => {
    mockPromoteExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Explore idea',
        mode: FeatureMode.Fast,
        lifecycle: SdlcLifecycle.Implementation,
      },
    });

    const cmd = createPromoteCommand();
    await cmd.parseAsync(['feat-001', '--fast'], { from: 'user' });

    expect(mockPromoteExecute).toHaveBeenCalledWith({
      featureId: 'feat-001',
      targetMode: FeatureMode.Fast,
    });
  });

  it('should display success output with feature details', async () => {
    mockPromoteExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Explore idea',
        mode: FeatureMode.Regular,
        lifecycle: SdlcLifecycle.Requirements,
      },
    });
    const { messages: mockMessages } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createPromoteCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(mockMessages.success).toHaveBeenCalledWith(expect.stringContaining('Explore idea'));
    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(logCalls).toMatch(/Regular/);
    expect(logCalls).toMatch(/Requirements/);
  });

  it('should set exitCode 1 when use case throws (non-exploration feature)', async () => {
    mockPromoteExecute.mockRejectedValue(
      new Error('Feature "My Feature" is not in Exploration mode (current: Fast)')
    );
    const { messages: mockMessages } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createPromoteCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    expect(mockMessages.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to promote'),
      expect.any(Error)
    );
  });

  it('should expose --fast option in command help', () => {
    const cmd = createPromoteCommand();
    const fastOption = cmd.options.find((o) => o.long === '--fast');
    expect(fastOption).toBeDefined();
    expect(fastOption?.description).toBeTruthy();
  });

  it('should use spinner during execution', async () => {
    mockPromoteExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Explore idea',
        mode: FeatureMode.Regular,
        lifecycle: SdlcLifecycle.Requirements,
      },
    });
    const { spinner: mockSpinner } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createPromoteCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(mockSpinner).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
  });
});
