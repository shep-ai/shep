import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock native/heavy dependencies that container.ts transitively imports.
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
  () => ({ getNotificationBus: vi.fn().mockReturnValue({}) })
);

vi.mock(
  '../../../../packages/core/src/infrastructure/services/agents/common/checkpointer.js',
  () => ({ createCheckpointer: vi.fn().mockReturnValue({}) })
);

const CONTAINER = '../../../../packages/core/src/infrastructure/di/container.js';

/**
 * Web routes resolve use cases by string token (`resolve('XxxUseCase')`). A
 * use case registered only by class throws "unregistered dependency token" at
 * runtime, which no typecheck catches — so each token the web depends on is
 * asserted to resolve to its own class.
 */
describe('Interactive DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves GetInteractiveAgentSupportUseCase by string token', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { GetInteractiveAgentSupportUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/interactive/get-interactive-agent-support.use-case.js'
    );
    const container = await initializeContainer();

    expect(container.resolve('GetInteractiveAgentSupportUseCase')).toBeInstanceOf(
      GetInteractiveAgentSupportUseCase
    );
  });
});
