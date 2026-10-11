/**
 * `shep contributors stale-issues` — the scheduled maintainer workflow's
 * entry point that replaced the daemon's stale good-first-issue watcher.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

const { mockUseCase, mockMessages } = vi.hoisted(() => ({
  mockUseCase: { execute: vi.fn() },
  mockMessages: { success: vi.fn(), error: vi.fn(), info: vi.fn(), newline: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: vi.fn().mockReturnValue(mockUseCase) },
}));

vi.mock('@/application/use-cases/contributors/detect-stale-good-first-issue.use-case.js', () => ({
  DetectStaleGoodFirstIssueUseCase: vi.fn(),
}));

vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
}));

import { createStaleIssuesCommand } from '../../../../src/presentation/cli/commands/contributors/stale-issues.command.js';

describe('stale-issues command', () => {
  const originalEnv = { ...process.env };
  const originalExitCode = process.exitCode;
  let logSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.exitCode = originalExitCode;
    logSpy.mockRestore();
  });

  it('checks the --repo slug with the --days threshold and lists each stale issue', async () => {
    mockUseCase.execute.mockResolvedValue({
      thresholdDays: 45,
      stale: [
        {
          owner: 'shep-ai',
          repo: 'shep',
          issueNumber: 7,
          title: 'Add a flag',
          url: 'https://github.com/shep-ai/shep/issues/7',
          lastActivityAt: '2026-08-01T00:00:00Z',
          staleForDays: 60,
        },
      ],
    });

    await createStaleIssuesCommand().parseAsync([
      'node',
      'stale-issues',
      '--repo',
      'shep-ai/shep',
      '--days',
      '45',
    ]);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      owner: 'shep-ai',
      repo: 'shep',
      staleDays: 45,
    });
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('#7');
    expect(printed).toContain('https://github.com/shep-ai/shep/issues/7');
    expect(process.exitCode).toBe(0);
  });

  it('falls back to GITHUB_REPOSITORY when --repo is omitted', async () => {
    process.env.GITHUB_REPOSITORY = 'acme/widgets';
    mockUseCase.execute.mockResolvedValue({ thresholdDays: 30, stale: [] });

    await createStaleIssuesCommand().parseAsync(['node', 'stale-issues']);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      staleDays: undefined,
    });
    expect(mockMessages.success).toHaveBeenCalled();
  });

  it('fails with a non-zero exit code when no repository is given', async () => {
    delete process.env.GITHUB_REPOSITORY;

    await createStaleIssuesCommand().parseAsync(['node', 'stale-issues']);

    expect(mockUseCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
