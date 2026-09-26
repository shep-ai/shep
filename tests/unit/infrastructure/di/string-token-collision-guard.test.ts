/**
 * Container-wide guard against one string token naming two different classes.
 *
 * tsyringe keeps every registration made under a token and `resolve()` returns
 * the LAST one. Two modules registering the same string for different classes
 * therefore compile, pass a `toBeDefined()` resolution test, and silently hand
 * every consumer whichever class registered last.
 *
 * That is how `CreateApplicationUseCase` — which injects
 * `@inject('RunWorkflowUseCase')` expecting the interactive step orchestrator —
 * was given `RunScheduledWorkflowUseCase`, because `registerScheduledWorkflows`
 * runs after `registerInteractive` and reused the same string.
 *
 * Registering one token twice for the SAME class is harmless and common (use
 * cases aliased from two modules), so the guard only fails when the resolved
 * classes differ. Tokens that are meant to hold several classes are listed in
 * INTENTIONAL_MULTI_CLASS_TOKENS with the reason.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

/**
 * Tokens that are deliberately registered to more than one class. Each entry
 * records why, so adding one is a visible, reviewable decision.
 */
const INTENTIONAL_MULTI_CLASS_TOKENS: Record<string, string> = {
  IDiagnostic: 'collected with @injectAll by RunDoctorUseCase',
  IRecapPublisher: 'collected with @injectAll by PublishMonthlyRecapUseCase',
  IAiChangeRiskSignalRepository:
    'register-aspm.ts registers a NoOp default in phase 7, then overrides it with the SQLite repository in phase 8',
};

/** tsyringe keeps its token map private; the guard needs to enumerate it. */
interface RegistryInternals {
  _registry: { entries(): Iterable<[unknown, unknown[]]> };
}

describe('DI container string tokens', () => {
  it('never registers one string token to two different classes', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const container = await initializeContainer();

    const registry = (container as unknown as RegistryInternals)._registry;
    const collisions: string[] = [];

    for (const [token, registrations] of registry.entries()) {
      if (
        typeof token !== 'string' ||
        registrations.length < 2 ||
        token in INTENTIONAL_MULTI_CLASS_TOKENS
      ) {
        continue;
      }
      // A duplicated token that cannot be resolved is reported, not skipped:
      // skipping would let the guard pass on exactly the tokens it exists for.
      let instances: unknown[];
      try {
        instances = container.resolveAll(token);
      } catch (error) {
        collisions.push(`${token} -> could not resolve: ${(error as Error).message}`);
        continue;
      }
      const classes = new Set(instances.map((instance) => (instance as object).constructor.name));
      if (classes.size > 1) {
        collisions.push(`${token} -> ${[...classes].join(', ')}`);
      }
    }

    expect(
      collisions,
      `String tokens registered to more than one class. resolve() returns the last ` +
        `registration, so every consumer of these tokens silently gets that one — give ` +
        `each class its own token:\n${collisions.join('\n')}`
    ).toEqual([]);
  });

  it('gives CreateApplicationUseCase the interactive workflow orchestrator', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const { CreateApplicationUseCase } = await import(
      '@/application/use-cases/applications/create-application.use-case.js'
    );
    const { RunWorkflowUseCase } = await import(
      '@/application/use-cases/workflows/run-workflow.use-case.js'
    );
    const { RunScheduledWorkflowUseCase } = await import(
      '@/application/use-cases/scheduled-workflows/run-scheduled-workflow.use-case.js'
    );
    const container = await initializeContainer();

    const createApplication = container.resolve(CreateApplicationUseCase) as unknown as {
      runWorkflow: unknown;
    };
    expect(createApplication.runWorkflow).toBeInstanceOf(RunWorkflowUseCase);
    expect(container.resolve('RunWorkflowUseCase')).toBeInstanceOf(RunWorkflowUseCase);
    expect(container.resolve('RunScheduledWorkflowUseCase')).toBeInstanceOf(
      RunScheduledWorkflowUseCase
    );
  });
});
