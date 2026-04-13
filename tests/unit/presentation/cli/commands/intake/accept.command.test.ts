import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockAcceptExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockAcceptExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/intake/accept-intake-item.use-case.js', () => ({
  AcceptIntakeItemUseCase: class {
    execute = mockAcceptExecute;
  },
}));

import { createAcceptCommand } from '../../../../../../src/presentation/cli/commands/intake/accept.command.js';

describe('intake accept command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockImplementation(() => ({
      execute: mockAcceptExecute,
    }));
    process.exitCode = undefined;
  });

  it('should create a command named "accept"', () => {
    const cmd = createAcceptCommand();
    expect(cmd.name()).toBe('accept');
  });

  it('should call AcceptIntakeItemUseCase with the item id', async () => {
    mockAcceptExecute.mockResolvedValue({
      ok: true,
      workItem: { id: 'wi-1', title: 'Created work item' },
    });

    const cmd = createAcceptCommand();
    await cmd.parseAsync(['intake-1'], { from: 'user' });

    expect(mockAcceptExecute).toHaveBeenCalledWith({ intakeItemId: 'intake-1' });
  });

  it('should display success message with work item info', async () => {
    mockAcceptExecute.mockResolvedValue({
      ok: true,
      workItem: { id: 'wi-1', title: 'Accepted item', identifierPrefix: 'TST', sequenceId: 5 },
    });

    const cmd = createAcceptCommand();
    await cmd.parseAsync(['intake-1'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Accepted');
  });

  it('should set exitCode on failure', async () => {
    mockAcceptExecute.mockResolvedValue({ ok: false, error: 'Not found' });

    const cmd = createAcceptCommand();
    await cmd.parseAsync(['intake-1'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
