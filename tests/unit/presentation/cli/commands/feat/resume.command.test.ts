/**
 * Feature Resume Command Unit Tests
 *
 * Resume claims a parallel-feature slot like start does (spec 116), so it
 * offers the same explicit override: `--force` resumes past the cap.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockResumeExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockResumeExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  colors: { muted: (s: string) => s, accent: (s: string) => s },
  messages: { newline: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import { createResumeCommand } from '../../../../../../src/presentation/cli/commands/feat/resume.command.js';

const RESUMED = {
  feature: { id: 'feat-001', name: 'Test Feature' },
  newRun: { id: 'run-0002-abcdef' },
};

describe('createResumeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;
    mockResolve.mockImplementation(() => ({ execute: mockResumeExecute }));
    mockResumeExecute.mockResolvedValue(RESUMED);
  });

  it('respects the parallel-feature cap by default', async () => {
    await createResumeCommand().parseAsync(['feat-001'], { from: 'user' });

    expect(mockResumeExecute).toHaveBeenCalledWith('feat-001', { bypassCapacityLimit: false });
  });

  it('--force resumes past the parallel-feature cap', async () => {
    await createResumeCommand().parseAsync(['feat-001', '--force'], { from: 'user' });

    expect(mockResumeExecute).toHaveBeenCalledWith('feat-001', { bypassCapacityLimit: true });
  });
});
