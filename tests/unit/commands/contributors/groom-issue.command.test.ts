/**
 * Integration test for `shep contributors groom-issue`.
 *
 * Simulates a GitHub Actions event by writing an `issues.opened`
 * payload to a temp file, points GITHUB_EVENT_PATH at it, then invokes
 * the command and asserts the use case received the parsed payload.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ContributionDifficulty, ContributorLane } from '@/domain/generated/output.js';

const { mockGroom, mockGate, mockWriter, mockMessages } = vi.hoisted(() => ({
  mockGroom: { execute: vi.fn() },
  mockGate: { gate: vi.fn() },
  mockWriter: {
    addLabels: vi.fn(),
    removeLabels: vi.fn(),
    addComment: vi.fn(),
    assignUsers: vi.fn(),
  },
  mockMessages: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    newline: vi.fn(),
  },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      if (token === 'IContributorActionGate') return mockGate;
      if (token === 'IGitHubIssueWriter') return mockWriter;
      return mockGroom;
    }),
  },
}));

vi.mock('@/application/use-cases/contributors/groom-issue.use-case.js', () => ({
  GroomIssueUseCase: vi.fn(),
}));

vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
}));

import { createGroomIssueCommand } from '../../../../src/presentation/cli/commands/contributors/groom-issue.command.js';

describe('groom-issue command', () => {
  let tempDir: string;
  let eventPath: string;
  const originalEnv = { ...process.env };
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(path.join(tmpdir(), 'shep-groom-'));
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

  function writeEvent(issueNumber = 11): void {
    writeFileSync(eventPath, JSON.stringify({ issue: { number: issueNumber } }));
  }

  function defaultGroomResult() {
    return {
      lane: ContributorLane.Docs,
      difficulty: ContributionDifficulty.GoodFirst,
      acceptanceCriteria: '- [ ] Update README',
      suggestedLabels: ['lane:docs', 'difficulty:goodFirst'],
    };
  }

  it('passes parsed issue ref to the use case', async () => {
    writeEvent(11);
    mockGroom.execute.mockResolvedValue(defaultGroomResult());
    mockGate.gate.mockResolvedValue({ approved: false, rationale: 'queued for human review' });

    await createGroomIssueCommand().parseAsync(['node', 'groom-issue']);

    expect(mockGroom.execute).toHaveBeenCalledWith({ ref: 'shep-ai/shep#11' });
    expect(process.exitCode).toBe(0);
  });

  it('applies labels via the issue writer when the gate approves', async () => {
    writeEvent(42);
    mockGroom.execute.mockResolvedValue(defaultGroomResult());
    mockGate.gate.mockResolvedValue({ approved: true, rationale: 'auto-approved' });

    await createGroomIssueCommand().parseAsync(['node', 'groom-issue']);

    expect(mockWriter.addLabels).toHaveBeenCalledWith(
      { owner: 'shep-ai', repo: 'shep', issueNumber: 42 },
      ['lane:docs', 'difficulty:goodFirst']
    );
  });

  it('skips writes when the gate denies', async () => {
    writeEvent(7);
    mockGroom.execute.mockResolvedValue(defaultGroomResult());
    mockGate.gate.mockResolvedValue({ approved: false, rationale: 'awaiting maintainer review' });

    await createGroomIssueCommand().parseAsync(['node', 'groom-issue']);

    expect(mockWriter.addLabels).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('exits non-zero when the payload is malformed', async () => {
    writeFileSync(eventPath, JSON.stringify({}));

    await createGroomIssueCommand().parseAsync(['node', 'groom-issue']);

    expect(process.exitCode).toBe(1);
    expect(mockGroom.execute).not.toHaveBeenCalled();
  });
});
