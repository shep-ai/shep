/**
 * DI registrations for `shep ps` (spec 144).
 *
 * The CLI resolves the three use cases by class; any other surface would use
 * the string tokens. The stats probe sits behind its port.
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

const USE_CASE_PATHS = {
  ListShepProcessesUseCase:
    '../../../../packages/core/src/application/use-cases/processes/list-shep-processes.use-case.js',
  StopShepProcessUseCase:
    '../../../../packages/core/src/application/use-cases/processes/stop-shep-process.use-case.js',
  SampleProcessStatsUseCase:
    '../../../../packages/core/src/application/use-cases/processes/sample-process-stats.use-case.js',
} as const;

describe('shep ps DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers each use case under its class token and its string token', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const container = await initializeContainer();
    const registry = (
      container as unknown as { _registry: { entries(): Iterable<[unknown, unknown]> } }
    )._registry;
    const classTokens = [...registry.entries()].map(([token]) => token);

    for (const [name, path] of Object.entries(USE_CASE_PATHS)) {
      const module = (await import(path)) as Record<string, new (...args: never[]) => unknown>;
      expect(classTokens, name).toContain(module[name]);
      expect(container.resolve(name), name).toBeInstanceOf(module[name]);
    }
  });

  it('registers the ps-backed stats probe behind its port', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { PsProcessStatsProbe } = await import(
      '../../../../packages/core/src/infrastructure/services/process/ps-process-stats-probe.js'
    );
    const container = await initializeContainer();

    expect(container.resolve('IProcessStatsProbe')).toBeInstanceOf(PsProcessStatsProbe);
  });
});
