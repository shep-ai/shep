/**
 * DI registrations for agent activity (spec 149): every use case under its
 * class token and its string token, and the host reporter chosen from the
 * environment — Herdr inside a Herdr pane, a no-op anywhere else.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const USE_CASES = '../../../../packages/core/src/application/use-cases/agent-activity/';
const USE_CASE_PATHS = {
  GetAgentActivityUseCase: `${USE_CASES}get-agent-activity.use-case.js`,
  WatchAgentActivityUseCase: `${USE_CASES}watch-agent-activity.use-case.js`,
  WaitForAgentActivityUseCase: `${USE_CASES}wait-for-agent-activity.use-case.js`,
  ReplyToFeatureUseCase: `${USE_CASES}reply-to-feature.use-case.js`,
  ReportHostActivityUseCase: `${USE_CASES}report-host-activity.use-case.js`,
} as const;
const CONTAINER = '../../../../packages/core/src/infrastructure/di/container.js';
const HOST = '../../../../packages/core/src/infrastructure/services/activity-host/';
const HERDR_VARIABLES = ['HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_BIN_PATH'] as const;

describe('Agent activity DI registrations', () => {
  const saved = Object.fromEntries(HERDR_VARIABLES.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    vi.resetModules();
    for (const name of HERDR_VARIABLES) delete process.env[name];
  });

  afterEach(() => {
    for (const name of HERDR_VARIABLES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('registers each use case under its class token and resolves it by string token', async () => {
    const { initializeContainer } = await import(CONTAINER);
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

  it('resolves the A2A request handler and HTTP endpoint by string token', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { A2aRequestHandler } = await import(
      '../../../../packages/core/src/infrastructure/services/a2a/a2a-request-handler.js'
    );
    const container = await initializeContainer();

    const { A2aHttpEndpoint } = await import(
      '../../../../packages/core/src/infrastructure/services/a2a/a2a-http-endpoint.js'
    );
    expect(container.resolve('A2aRequestHandler')).toBeInstanceOf(A2aRequestHandler);
    expect(container.resolve('A2aHttpEndpoint')).toBeInstanceOf(A2aHttpEndpoint);
  });

  it('uses the no-op reporter outside Herdr', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { NoopActivityReporter } = await import(`${HOST}noop-activity-reporter.js`);
    const container = await initializeContainer();

    expect(container.resolve('IActivityHostReporter')).toBeInstanceOf(NoopActivityReporter);
  });

  it('uses the Herdr reporter inside a Herdr pane', async () => {
    process.env.HERDR_ENV = '1';
    process.env.HERDR_PANE_ID = 'w1:p1';
    process.env.HERDR_BIN_PATH = '/usr/local/bin/herdr';
    const { initializeContainer } = await import(CONTAINER);
    const { HerdrActivityReporter } = await import(`${HOST}herdr-activity-reporter.js`);
    const container = await initializeContainer();

    expect(container.resolve('IActivityHostReporter')).toBeInstanceOf(HerdrActivityReporter);
  });
});
