/**
 * Log use cases resolvable by string token — the web app imports core use
 * cases type-only and resolves them by name (LESSONS: "A Next.js server
 * action must resolve core use cases by token"), spec 116.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock native/heavy dependencies that container.ts transitively imports
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

describe('log use case DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves GetWorkerLogPathUseCase by its string token', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { GetWorkerLogPathUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/logs/get-worker-log-path.use-case.js'
    );

    const container = await initializeContainer();

    expect(container.resolve('GetWorkerLogPathUseCase')).toBeInstanceOf(GetWorkerLogPathUseCase);
  });
});
