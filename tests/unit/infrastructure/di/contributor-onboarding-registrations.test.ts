/**
 * DI graph integration test for feature 097 (contributor onboarding) ports.
 *
 * Resolves every new port introduced in Phase 2 and asserts the
 * concrete adapter is the one wired in.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node-notifier', () => ({ default: { notify: vi.fn() } }));
vi.mock('which', () => ({ default: vi.fn().mockResolvedValue(null) }));
vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockReturnValue({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
}));

vi.mock('../../../../packages/core/src/infrastructure/persistence/sqlite/connection.js', () => ({
  getSQLiteConnection: vi.fn().mockResolvedValue({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
}));

vi.mock('../../../../packages/core/src/infrastructure/persistence/sqlite/migrations.js', () => ({
  runSQLiteMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  '../../../../packages/core/src/infrastructure/services/notifications/notification-bus.js',
  () => ({
    getNotificationBus: vi.fn().mockReturnValue({}),
  })
);

vi.mock(
  '../../../../packages/core/src/infrastructure/services/agents/common/checkpointer.js',
  () => ({
    createCheckpointer: vi.fn().mockReturnValue({}),
  })
);

describe('contributor onboarding DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves IGitHubIssueWriter as GitHubIssueWriter', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { GitHubIssueWriter } = await import(
      '../../../../packages/core/src/infrastructure/services/external/github-issue-writer.service.js'
    );

    const container = await initializeContainer();
    const resolved = container.resolve('IGitHubIssueWriter');
    expect(resolved).toBeInstanceOf(GitHubIssueWriter);
  });

  it('resolves IAllContributorsWriter as AllContributorsWriter', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { AllContributorsWriter } = await import(
      '../../../../packages/core/src/infrastructure/services/contributors/all-contributors-writer.service.js'
    );

    const container = await initializeContainer();
    const resolved = container.resolve('IAllContributorsWriter');
    expect(resolved).toBeInstanceOf(AllContributorsWriter);
  });

  it('resolves IOutreachPublisher as DiscordOutreachPublisher', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { DiscordOutreachPublisher } = await import(
      '../../../../packages/core/src/infrastructure/services/outreach/discord-outreach-publisher.service.js'
    );

    const container = await initializeContainer();
    const resolved = container.resolve('IOutreachPublisher');
    expect(resolved).toBeInstanceOf(DiscordOutreachPublisher);
  });

  it('resolves each IRecapPublisher channel to its dedicated adapter', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { FileRecapPublisher } = await import(
      '../../../../packages/core/src/infrastructure/services/recap/file-recap-publisher.service.js'
    );
    const { DiscordRecapPublisher } = await import(
      '../../../../packages/core/src/infrastructure/services/recap/discord-recap-publisher.service.js'
    );
    const { GithubDiscussionRecapPublisher } = await import(
      '../../../../packages/core/src/infrastructure/services/recap/github-discussion-recap-publisher.service.js'
    );
    const { RecapChannel } = await import(
      '../../../../packages/core/src/domain/generated/output.js'
    );

    const container = await initializeContainer();
    expect(container.resolve(`IRecapPublisher:${RecapChannel.File}`)).toBeInstanceOf(
      FileRecapPublisher
    );
    expect(container.resolve(`IRecapPublisher:${RecapChannel.Discord}`)).toBeInstanceOf(
      DiscordRecapPublisher
    );
    expect(container.resolve(`IRecapPublisher:${RecapChannel.GithubDiscussion}`)).toBeInstanceOf(
      GithubDiscussionRecapPublisher
    );
  });

  it('resolves IDiagnosticRunner as DiagnosticRunner', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { DiagnosticRunner } = await import(
      '../../../../packages/core/src/infrastructure/services/doctor/diagnostic-runner.service.js'
    );

    const container = await initializeContainer();
    expect(container.resolve('IDiagnosticRunner')).toBeInstanceOf(DiagnosticRunner);
  });
});
