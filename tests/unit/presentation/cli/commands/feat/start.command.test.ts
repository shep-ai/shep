/**
 * Feature Start Command Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockStartExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockStartExecute: vi.fn(),
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

import { createStartCommand } from '../../../../../../src/presentation/cli/commands/feat/start.command.js';

describe('createStartCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined as any;
    mockResolve.mockImplementation(() => ({ execute: mockStartExecute }));
  });

  it('should create a command named "start"', () => {
    const cmd = createStartCommand();
    expect(cmd.name()).toBe('start');
  });

  it('should call StartFeatureUseCase.execute with the provided ID', async () => {
    mockStartExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Test Feature',
        branch: 'feat/test-feature',
        lifecycle: 'Requirements',
      },
      agentRun: { id: 'run-001' },
    });

    const cmd = createStartCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(mockStartExecute).toHaveBeenCalledWith('feat-001', { bypassCapacityLimit: false });
  });

  it('should display success output with feature details on success', async () => {
    mockStartExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Test Feature',
        branch: 'feat/test-feature',
        lifecycle: 'Requirements',
      },
      agentRun: { id: 'run-001' },
    });
    const { messages: mockMessages } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createStartCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(mockMessages.success).toHaveBeenCalledWith(expect.stringContaining('started'));
    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(logCalls).toMatch(/Test Feature/);
    expect(logCalls).toMatch(/feat\/test-feature/);
  });

  it('should show blocked message when feature transitions to Blocked', async () => {
    mockStartExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Child Feature',
        branch: 'feat/child-feature',
        lifecycle: 'Blocked',
      },
      agentRun: { id: 'run-001' },
      blocked: true,
      blockedBy: { id: 'parent-001', name: 'Parent Feature', lifecycle: 'Implementation' },
    });
    const { messages: mockMessages } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createStartCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(mockMessages.warning).toHaveBeenCalledWith(expect.stringContaining('Blocked'));
  });

  it('should display error and set exit code 1 on failure', async () => {
    mockStartExecute.mockRejectedValue(
      new Error('Feature "Test" is not in Pending state (current: Requirements)')
    );
    const { messages: mockMessages } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createStartCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    expect(mockMessages.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start feature'),
      expect.any(Error)
    );
  });

  it('should use spinner during execution', async () => {
    mockStartExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Test Feature',
        branch: 'feat/test-feature',
        lifecycle: 'Requirements',
      },
      agentRun: { id: 'run-001' },
    });
    const { spinner: mockSpinner } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createStartCommand();
    await cmd.parseAsync(['feat-001'], { from: 'user' });

    expect(mockSpinner).toHaveBeenCalledWith('Starting feature', expect.any(Function));
  });
});
