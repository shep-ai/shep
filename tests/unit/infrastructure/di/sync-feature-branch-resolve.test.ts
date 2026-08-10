/**
 * Commit-then-rebase DI resolution guard.
 *
 * `SyncFeatureBranchUseCase` is injected into `RebaseFeatureOnMainUseCase` and
 * `StartFeatureUseCase`. A missing `registerSingleton` — or a constructor
 * parameter carrying no explicit `@inject` token — does not fail typecheck,
 * lint or any mock-based unit test. It only explodes the first time the real
 * container resolves either use case, i.e. when a user clicks Start or Rebase
 * on Main.
 *
 * Resolving the consumer is NOT enough to prove the wiring: when the runtime
 * emits no `design:paramtypes` (esbuild/SWC — tsx, vitest and Next.js all use
 * one), tsyringe silently passes `undefined` for every parameter that has no
 * explicit token, and the consumer still constructs. So each test below also
 * asserts the injected dependency actually arrived.
 */

import { describe, it, expect } from 'vitest';

/** Read a constructor-injected private field for wiring assertions. */
function injected(instance: object, field: string): unknown {
  return (instance as unknown as Record<string, unknown>)[field];
}

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
    const { SpawnFeatureAgentUseCase } = await import(
      '@/application/use-cases/features/spawn-feature-agent.use-case.js'
    );

    expect(container.resolve(SyncFeatureBranchUseCase)).toBeDefined();

    // Each consumer must receive the shared sync use case, not `undefined`.
    expect(
      injected(container.resolve(RebaseFeatureOnMainUseCase), 'syncFeatureBranch')
    ).toBeInstanceOf(SyncFeatureBranchUseCase);

    // StartFeatureUseCase reaches the sync one hop away now: it owns no spawn
    // logic of its own, delegating to the single spawn path. Assert the whole
    // chain — a hollow link anywhere still yields a use case that constructs
    // fine and fails at the first property access.
    const spawnFeatureAgent = injected(
      container.resolve(StartFeatureUseCase),
      'spawnFeatureAgent'
    ) as object;
    expect(spawnFeatureAgent).toBeInstanceOf(SpawnFeatureAgentUseCase);
    expect(injected(spawnFeatureAgent, 'syncFeatureBranch')).toBeInstanceOf(
      SyncFeatureBranchUseCase
    );
  });

  it('resolves the string-token aliases the web actions use', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const container = await initializeContainer();
    const { SyncFeatureBranchUseCase } = await import(
      '@/application/use-cases/features/sync-feature-branch.use-case.js'
    );

    // The web "Rebase on Main" action resolves by string token — the alias must
    // yield a fully wired instance, not one with a hollow dependency.
    expect(
      injected(container.resolve<object>('RebaseFeatureOnMainUseCase'), 'syncFeatureBranch')
    ).toBeInstanceOf(SyncFeatureBranchUseCase);
    const { SpawnFeatureAgentUseCase } = await import(
      '@/application/use-cases/features/spawn-feature-agent.use-case.js'
    );
    const spawnFeatureAgent = injected(
      container.resolve<object>('StartFeatureUseCase'),
      'spawnFeatureAgent'
    ) as object;
    expect(spawnFeatureAgent).toBeInstanceOf(SpawnFeatureAgentUseCase);
    expect(injected(spawnFeatureAgent, 'syncFeatureBranch')).toBeInstanceOf(
      SyncFeatureBranchUseCase
    );
  });
});
