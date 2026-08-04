/**
 * Spec 106 DI resolution guard.
 *
 * The session tree first failed at runtime with "Attempted to resolve
 * unregistered dependency token: BuildSessionTreeUseCase". Registration was in
 * fact present — the running process had a container bootstrapped before the
 * code existed — but nothing asserted these tokens resolve, so a genuine
 * registration miss would look identical.
 */

import { describe, it, expect } from 'vitest';

describe('spec 106 DI tokens', () => {
  it('resolves the session tree, archive and delete tokens', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const container = await initializeContainer();

    expect(container.resolve('BuildSessionTreeUseCase')).toBeDefined();
    expect(container.resolve('ArchiveAgentSessionUseCase')).toBeDefined();
    expect(container.resolve('DeleteAgentSessionUseCase')).toBeDefined();
    expect(container.resolve('IArchivedSessionRepository')).toBeDefined();
  });

  it('builds a session tree end to end through the container', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const container = await initializeContainer();

    const useCase = container.resolve<{
      execute: (i?: unknown) => Promise<{ repositories: unknown[]; archivedCount: number }>;
    }>('BuildSessionTreeUseCase');

    const result = await useCase.execute({ includeArchived: false });

    expect(Array.isArray(result.repositories)).toBe(true);
    expect(typeof result.archivedCount).toBe('number');
  });
});
