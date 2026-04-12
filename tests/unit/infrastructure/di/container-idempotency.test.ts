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

describe('container idempotency', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('isContainerInitialized() returns false before init', async () => {
    const mod = await import('../../../../packages/core/src/infrastructure/di/container.js');
    expect(mod.isContainerInitialized()).toBe(false);
  });

  it('isContainerInitialized() returns true after init', async () => {
    const mod = await import('../../../../packages/core/src/infrastructure/di/container.js');
    await mod.initializeContainer();
    expect(mod.isContainerInitialized()).toBe(true);
  });

  it('initializeContainer() returns the same container on second call', async () => {
    const mod = await import('../../../../packages/core/src/infrastructure/di/container.js');
    const first = await mod.initializeContainer();
    const second = await mod.initializeContainer();
    expect(first).toBe(second);
  });
});
