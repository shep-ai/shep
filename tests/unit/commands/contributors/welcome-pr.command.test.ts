/**
 * Integration test for `shep contributors welcome-pr`.
 *
 * Simulates a GitHub Actions event by writing a `pull_request.opened`
 * payload to a temp file, points GITHUB_EVENT_PATH at it, then invokes
 * the command and asserts the use case received the parsed payload.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { mockUseCase, mockMessages } = vi.hoisted(() => ({
  mockUseCase: { execute: vi.fn() },
  mockMessages: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    newline: vi.fn(),
  },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: vi.fn().mockReturnValue(mockUseCase) },
}));

vi.mock('@/application/use-cases/contributors/welcome-first-time-contributor.use-case.js', () => ({
  WelcomeFirstTimeContributorUseCase: vi.fn(),
}));

vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
}));

import { createWelcomePrCommand } from '../../../../src/presentation/cli/commands/contributors/welcome-pr.command.js';

describe('welcome-pr command', () => {
  let tempDir: string;
  let eventPath: string;
  const originalEnv = { ...process.env };
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(path.join(tmpdir(), 'shep-welcome-pr-'));
    eventPath = path.join(tempDir, 'event.json');
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_REPOSITORY = 'shep-ai/shep';
    process.exitCode = 0;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
    process.exitCode = originalExitCode;
  });

  it('passes parsed pull_request payload to the use case', async () => {
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          number: 42,
          user: { login: 'newbie', avatar_url: 'https://example.com/a.png' },
        },
      })
    );
    mockUseCase.execute.mockResolvedValue({
      firstTime: true,
      contributor: { id: 'c1' },
      recognitionEvent: { id: 'r1' },
      commentPosted: true,
      gateRationale: 'auto-approved',
    });

    await createWelcomePrCommand().parseAsync(['node', 'welcome-pr']);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      prRef: { owner: 'shep-ai', repo: 'shep', issueNumber: 42 },
      authorLogin: 'newbie',
      authorAvatarUrl: 'https://example.com/a.png',
    });
    expect(process.exitCode).toBe(0);
  });

  it('falls back to repository field on payload when GITHUB_REPOSITORY is unset', async () => {
    delete process.env.GITHUB_REPOSITORY;
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: { number: 7, user: { login: 'octo' } },
        repository: { owner: { login: 'fork-owner' }, name: 'forked' },
      })
    );
    mockUseCase.execute.mockResolvedValue({ firstTime: false });

    await createWelcomePrCommand().parseAsync(['node', 'welcome-pr']);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prRef: { owner: 'fork-owner', repo: 'forked', issueNumber: 7 },
      })
    );
  });

  it('exits non-zero when GITHUB_EVENT_PATH is missing', async () => {
    delete process.env.GITHUB_EVENT_PATH;

    await createWelcomePrCommand().parseAsync(['node', 'welcome-pr']);

    expect(process.exitCode).toBe(1);
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it('exits non-zero when payload is missing required fields', async () => {
    writeFileSync(eventPath, JSON.stringify({ pull_request: {} }));

    await createWelcomePrCommand().parseAsync(['node', 'welcome-pr']);

    expect(process.exitCode).toBe(1);
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it('skips silently when the contributor is not a first-timer', async () => {
    writeFileSync(
      eventPath,
      JSON.stringify({ pull_request: { number: 9, user: { login: 'veteran' } } })
    );
    mockUseCase.execute.mockResolvedValue({ firstTime: false });

    await createWelcomePrCommand().parseAsync(['node', 'welcome-pr']);

    expect(process.exitCode).toBe(0);
    expect(mockMessages.info).toHaveBeenCalled();
    expect(mockMessages.success).not.toHaveBeenCalled();
  });
});
