/**
 * `shep contributors recap` — the scheduled maintainer workflow's entry
 * point that replaced the daemon's monthly recap watcher.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RecapChannel } from '@/domain/generated/output.js';

const { mockGenerate, mockPublish, mockMessages, resolveMock } = vi.hoisted(() => {
  const mockGenerate = { execute: vi.fn() };
  const mockPublish = { execute: vi.fn() };
  return {
    mockGenerate,
    mockPublish,
    mockMessages: { success: vi.fn(), error: vi.fn(), info: vi.fn(), newline: vi.fn() },
    resolveMock: vi.fn(),
  };
});

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: resolveMock },
}));

vi.mock('@/application/use-cases/contributors/generate-monthly-recap.use-case.js', () => ({
  GenerateMonthlyRecapUseCase: class GenerateMonthlyRecapUseCase {},
}));

vi.mock('@/application/use-cases/contributors/publish-monthly-recap.use-case.js', () => ({
  PublishMonthlyRecapUseCase: class PublishMonthlyRecapUseCase {},
}));

vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
}));

import { createRecapCommand } from '../../../../src/presentation/cli/commands/contributors/recap.command.js';

const artifact = {
  recapId: '2026-09',
  title: 'Shep — 2026-09 contributor recap',
  body: '# recap',
  periodStartIso: '2026-09-01T00:00:00.000Z',
  periodEndIso: '2026-10-01T00:00:00.000Z',
};

describe('recap command', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    resolveMock.mockImplementation((token: { name?: string }) =>
      token?.name === 'GenerateMonthlyRecapUseCase' ? mockGenerate : mockPublish
    );
    mockGenerate.execute.mockResolvedValue({ artifact, stats: { totalEvents: 0 } });
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('generates the requested month and publishes it to the file channel', async () => {
    mockPublish.execute.mockResolvedValue({
      outcomes: [
        { channel: RecapChannel.File, status: 'published', reference: 'recaps/2026-09.md' },
      ],
    });

    await createRecapCommand().parseAsync(['node', 'recap', '--month', '2026-09']);

    expect(mockGenerate.execute).toHaveBeenCalledWith({ yearMonth: '2026-09' });
    expect(mockPublish.execute).toHaveBeenCalledWith({
      artifact,
      targets: [{ channel: RecapChannel.File }],
    });
    expect(mockMessages.success).toHaveBeenCalledWith(expect.stringContaining('recaps/2026-09.md'));
    expect(process.exitCode).toBe(0);
  });

  it('defaults to the previous calendar month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T03:00:00Z'));
    mockPublish.execute.mockResolvedValue({ outcomes: [] });

    await createRecapCommand().parseAsync(['node', 'recap']);

    vi.useRealTimers();
    expect(mockGenerate.execute).toHaveBeenCalledWith({ yearMonth: '2026-09' });
  });

  it('rejects a malformed --month', async () => {
    await createRecapCommand().parseAsync(['node', 'recap', '--month', 'September']);

    expect(mockGenerate.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('exits non-zero when a channel fails to publish', async () => {
    mockPublish.execute.mockResolvedValue({
      outcomes: [{ channel: RecapChannel.File, status: 'failed', error: 'EACCES' }],
    });

    await createRecapCommand().parseAsync(['node', 'recap', '--month', '2026-09']);

    expect(process.exitCode).toBe(1);
  });
});
