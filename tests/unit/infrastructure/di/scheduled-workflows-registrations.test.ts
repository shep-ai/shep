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
 * Every scheduled-workflow use case the web layer resolves by string token
 * (`resolve('XxxUseCase')`). The scheduled-workflows feature (073) registered
 * these use cases only under their class references, so every workflows page
 * threw "Attempted to resolve unregistered dependency token: ListWorkflowsUseCase"
 * at runtime. This test guards against that whole class of regression by
 * asserting each token resolves from the fully-bootstrapped container.
 */
const SCHEDULED_WORKFLOW_USE_CASE_TOKENS = [
  'CreateWorkflowUseCase',
  'UpdateWorkflowUseCase',
  'DeleteWorkflowUseCase',
  'ListWorkflowsUseCase',
  'GetWorkflowUseCase',
  'RunScheduledWorkflowUseCase',
  'ScheduleWorkflowUseCase',
  'GetWorkflowHistoryUseCase',
  'ToggleWorkflowUseCase',
] as const;

describe('Scheduled-workflows DI registrations (spec 111)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each(SCHEDULED_WORKFLOW_USE_CASE_TOKENS)('resolves %s by string token', async (token) => {
    const { initializeContainer } = await import(CONTAINER);
    const container = await initializeContainer();
    const instance = container.resolve(token);
    expect(instance).toBeDefined();
    expect(typeof instance).toBe('object');
  });
});
