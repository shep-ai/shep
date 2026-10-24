/**
 * DI registrations for the terminal feature console (specs 142, 143).
 *
 * `shep tui` resolves its three use cases by class; any future web surface
 * would resolve them by string token. Both must be registered — and a class
 * token must be in the registry, not just constructible, because tsyringe
 * auto-constructs any `@injectable` class on demand (LESSONS.md).
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

const CONSOLE_USE_CASE_PATHS = {
  GetFeatureConsoleSnapshotUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/get-feature-console-snapshot.use-case.js',
  RunFeatureConsoleActionUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/run-feature-console-action.use-case.js',
  GetFeatureLogTailUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/get-feature-log-tail.use-case.js',
  OpenFeaturePaneUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/open-feature-pane.use-case.js',
  OpenControlCenterUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/open-control-center.use-case.js',
  UpdateMultiplexerStatusUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/update-multiplexer-status.use-case.js',
  GetFeatureChatUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/get-feature-chat.use-case.js',
  SendFeatureChatMessageUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/send-feature-chat-message.use-case.js',
  AnswerFeatureChatQuestionUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/answer-feature-chat-question.use-case.js',
  StopFeatureChatsUseCase:
    '../../../../packages/core/src/application/use-cases/feature-console/stop-feature-chats.use-case.js',
} as const;

describe('Feature console DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers each console use case under its class token', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const container = await initializeContainer();
    const registry = (
      container as unknown as { _registry: { entries(): Iterable<[unknown, unknown]> } }
    )._registry;
    const classTokens = [...registry.entries()]
      .map(([token]) => token)
      .filter((token): token is object => typeof token === 'function');

    for (const [name, path] of Object.entries(CONSOLE_USE_CASE_PATHS)) {
      const module = (await import(path)) as Record<string, unknown>;
      expect(classTokens, name).toContain(module[name]);
    }
  });

  it('resolves each console use case by its string token', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const container = await initializeContainer();

    for (const [name, path] of Object.entries(CONSOLE_USE_CASE_PATHS)) {
      const module = (await import(path)) as Record<string, new (...args: never[]) => unknown>;
      expect(container.resolve(name), name).toBeInstanceOf(module[name]);
    }
  });

  it('registers the terminal pane launcher behind its port (spec 143)', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { TerminalPaneLauncherService } = await import(
      '../../../../packages/core/src/infrastructure/services/terminal-pane/terminal-pane-launcher.service.js'
    );
    const container = await initializeContainer();

    expect(container.resolve('ITerminalPaneLauncher')).toBeInstanceOf(TerminalPaneLauncherService);
  });
});
