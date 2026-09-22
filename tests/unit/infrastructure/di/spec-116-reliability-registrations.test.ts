/**
 * Spec 116 wiring: the dependencies added for harness reliability must be
 * reachable through the real container, not only through hand-built tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const IDENTITY =
  '../../../../packages/core/src/infrastructure/services/webhook/webhook-identity.store.js';

describe('spec 116 DI wiring', () => {
  let shepHome: string;
  let prevShepHome: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    prevShepHome = process.env.SHEP_HOME;
    shepHome = mkdtempSync(join(tmpdir(), 'shep-116-di-'));
    process.env.SHEP_HOME = shepHome;
  });

  afterEach(() => {
    if (prevShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = prevShepHome;
    rmSync(shepHome, { recursive: true, force: true });
  });

  it('gives the deferred-question registry the question repository, so cross-process answers are observed', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const container = await initializeContainer();
    const registry = container.resolve('IDeferredQuestionRegistry') as {
      questionRepository?: unknown;
    };
    const repository = container.resolve('IAgentQuestionRepository') as object;
    expect(registry.questionRepository).toBeInstanceOf(repository.constructor);
  });

  it('builds the GitHub webhook service with the persisted per-installation secret', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { WEBHOOK_IDENTITY_FILENAME } = await import(IDENTITY);
    const container = await initializeContainer();

    const service = container.resolve('IGitHubWebhookService') as { getSecret(): string };
    const persisted = JSON.parse(readFileSync(join(shepHome, WEBHOOK_IDENTITY_FILENAME), 'utf8'));

    expect(service.getSecret()).toBe(persisted.secret);
  });
});
