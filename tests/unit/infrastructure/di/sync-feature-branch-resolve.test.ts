/**
 * Commit-then-rebase DI resolution guard.
 *
 * `SyncFeatureBranchUseCase` is injected into `RebaseFeatureOnMainUseCase` and
 * `StartFeatureUseCase` as a bare class type (no `@inject` token). tsyringe
 * resolves that by introspecting the constructor, so a missing
 * `registerSingleton` does not fail typecheck, lint or any mock-based unit test
 * — it only explodes the first time the real container resolves either use
 * case, i.e. when a user clicks Start or Rebase on Main.
 */

import { describe, it, expect } from 'vitest';

describe('commit-then-rebase DI wiring', () => {
  it('resolves SyncFeatureBranchUseCase and both of its consumers', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const container = await initializeContainer();

    const { SyncFeatureBranchUseCase } = await import(
      '@/application/use-cases/features/sync-feature-branch.use-case.js'
    );
    const { RebaseFeatureOnMainUseCase } = await import(
      '@/application/use-cases/features/rebase-feature-on-main.use-case.js'
    );
    const { StartFeatureUseCase } = await import(
      '@/application/use-cases/features/start-feature.use-case.js'
    );

    // Each consumer resolves only if the shared sync use case resolves too.
    expect(container.resolve(SyncFeatureBranchUseCase)).toBeDefined();
    expect(container.resolve(RebaseFeatureOnMainUseCase)).toBeDefined();
    expect(container.resolve(StartFeatureUseCase)).toBeDefined();
  });

  it('resolves the string-token aliases the web actions use', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const container = await initializeContainer();

    expect(container.resolve('RebaseFeatureOnMainUseCase')).toBeDefined();
    expect(container.resolve('StartFeatureUseCase')).toBeDefined();
  });
});
