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

describe('RejectAgentRunUseCase string-token alias', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves RejectAgentRunUseCase via string token after initialization', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { RejectAgentRunUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/agents/reject-agent-run.use-case.js'
    );

    const container = await initializeContainer();
    const resolved = container.resolve('RejectAgentRunUseCase');

    expect(resolved).toBeInstanceOf(RejectAgentRunUseCase);
  });
});
