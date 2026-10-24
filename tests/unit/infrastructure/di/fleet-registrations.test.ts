/**
 * DI graph integration test for the Fleet Control Plane (spec 111).
 *
 * Resolves every port and use case introduced by the feature and asserts the
 * concrete adapter is the one wired in. This is the regression guard for the
 * original defect where `IFleetRepository` had a token and consumers but no
 * registration, so every `shep fleet *` command threw at resolve time.
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

describe('Fleet Control Plane DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves IFleetRepository as SQLiteFleetRepository', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { SQLiteFleetRepository } = await import(
      '../../../../packages/core/src/infrastructure/repositories/sqlite-fleet.repository.js'
    );

    const container = await initializeContainer();

    expect(container.resolve('IFleetRepository')).toBeInstanceOf(SQLiteFleetRepository);
  });

  it('resolves every fleet use case through the container', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { GetFleetOverviewUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/get-fleet-overview.use-case.js'
    );
    const { ListFleetTriageItemsUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/list-fleet-triage-items.use-case.js'
    );
    const { BatchApproveFeaturesUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/batch-approve-features.use-case.js'
    );
    const { SetFleetQueuePauseUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/set-fleet-queue-pause.use-case.js'
    );
    const { CollectGateMetricsUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/collect-gate-metrics.use-case.js'
    );
    const { EvaluateFeatureLowRiskUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/evaluate-feature-low-risk.use-case.js'
    );

    const container = await initializeContainer();

    expect(container.resolve(GetFleetOverviewUseCase)).toBeInstanceOf(GetFleetOverviewUseCase);
    expect(container.resolve(ListFleetTriageItemsUseCase)).toBeInstanceOf(
      ListFleetTriageItemsUseCase
    );
    expect(container.resolve(BatchApproveFeaturesUseCase)).toBeInstanceOf(
      BatchApproveFeaturesUseCase
    );
    expect(container.resolve(SetFleetQueuePauseUseCase)).toBeInstanceOf(SetFleetQueuePauseUseCase);
    expect(container.resolve(CollectGateMetricsUseCase)).toBeInstanceOf(CollectGateMetricsUseCase);
    expect(container.resolve(EvaluateFeatureLowRiskUseCase)).toBeInstanceOf(
      EvaluateFeatureLowRiskUseCase
    );
  });

  it('registers the queue-pause use case as a class token', async () => {
    // NOT "container.resolve(X) is an instance of X": tsyringe auto-constructs
    // any @injectable class, so that assertion passes with no registration at
    // all — proven by deleting the `registerSingleton` call and watching it stay
    // green. The registration is what puts the class into the container's token
    // registry, and `hollow-dependency-guard` only sweeps REGISTERED class
    // tokens; an unregistered use case escapes that guard entirely.
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { SetFleetQueuePauseUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/set-fleet-queue-pause.use-case.js'
    );

    const container = await initializeContainer();
    const registry = (
      container as unknown as { _registry: { entries(): Iterable<[unknown, unknown]> } }
    )._registry;
    const classTokens = [...registry.entries()]
      .map(([token]) => token)
      .filter((token): token is object => typeof token === 'function');

    expect(classTokens).toContain(SetFleetQueuePauseUseCase);
  });

  it('resolves the queue-pause use case by its string token, as the web resume action does', async () => {
    // The dashboard's Resume button reaches this use case through a server
    // action, and server actions resolve by STRING: a value import of core breaks
    // the Next build (Turbopack cannot follow core's `.js`-suffixed imports). A
    // class-only registration compiles fine and throws at runtime, on click.
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { SetFleetQueuePauseUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/set-fleet-queue-pause.use-case.js'
    );

    const container = await initializeContainer();

    expect(container.isRegistered('SetFleetQueuePauseUseCase')).toBe(true);
    expect(container.resolve('SetFleetQueuePauseUseCase')).toBeInstanceOf(
      SetFleetQueuePauseUseCase
    );
  });

  it('exposes stable string tokens matching the use-case names', async () => {
    const tokens = await import('../../../../packages/core/src/infrastructure/di/tokens.js');

    expect(tokens.IFleetRepositoryToken).toBe('IFleetRepository');
    expect(tokens.GetFleetOverviewUseCaseToken).toBe('GetFleetOverviewUseCase');
    expect(tokens.SetFleetQueuePauseUseCaseToken).toBe('SetFleetQueuePauseUseCase');
    expect(tokens.ListFleetTriageItemsUseCaseToken).toBe('ListFleetTriageItemsUseCase');
    expect(tokens.BatchApproveFeaturesUseCaseToken).toBe('BatchApproveFeaturesUseCase');
    expect(tokens.RetryFailedFleetFeaturesUseCaseToken).toBe('RetryFailedFleetFeaturesUseCase');
    expect(tokens.CollectGateMetricsUseCaseToken).toBe('CollectGateMetricsUseCase');
    expect(tokens.EvaluateFeatureLowRiskUseCaseToken).toBe('EvaluateFeatureLowRiskUseCase');
  });

  /**
   * The CLASS token alone is not enough. A server action resolves its use case by
   * STRING (`resolve<Foo>('Foo')`), and tsyringe throws "Attempted to resolve
   * unregistered dependency token" at RUNTIME — not at build time — when the
   * class is registered but the string alias is not. Resolving by the literal
   * string is the only assertion that catches that.
   */
  it('resolves the fleet retry use case by its string token, as a server action would', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { RetryFailedFleetFeaturesUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/retry-failed-fleet-features.use-case.js'
    );

    const container = await initializeContainer();

    expect(container.resolve('RetryFailedFleetFeaturesUseCase')).toBeInstanceOf(
      RetryFailedFleetFeaturesUseCase
    );
  });

  it('registers the fleet retry use case as a class token, so the DI guards sweep it', async () => {
    // `hollow-dependency-guard` only walks REGISTERED class tokens, so an
    // unregistered use case escapes it while still resolving on demand.
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { RetryFailedFleetFeaturesUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/fleet/retry-failed-fleet-features.use-case.js'
    );

    const container = await initializeContainer();
    const registry = (
      container as unknown as { _registry: { entries(): Iterable<[unknown, unknown]> } }
    )._registry;
    const classTokens = [...registry.entries()]
      .map(([token]) => token)
      .filter((token): token is object => typeof token === 'function');

    expect(classTokens).toContain(RetryFailedFleetFeaturesUseCase);
  });
});
