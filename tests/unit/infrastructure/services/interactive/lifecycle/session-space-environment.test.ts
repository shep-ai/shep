import { describe, it, expect, vi } from 'vitest';
import { SessionSpaceEnvironment } from '@/infrastructure/services/interactive/lifecycle/session-space-environment.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { ResolveSpaceEnvironmentUseCase } from '@/application/use-cases/spaces/resolve-space-environment.use-case.js';
import { AgentType } from '@/domain/generated/output.js';

const environment = { set: { GH_CONFIG_DIR: '/gh-acme' }, unset: ['GH_TOKEN'] };

function make(feature: unknown, agentRefusal?: string) {
  const features = { findById: vi.fn().mockResolvedValue(feature) };
  const resolve = {
    execute: vi
      .fn()
      .mockResolvedValue({ context: {}, environment, ...(agentRefusal ? { agentRefusal } : {}) }),
  };
  const sessionEnvironment = new SessionSpaceEnvironment(
    features as unknown as IFeatureRepository,
    resolve as unknown as ResolveSpaceEnvironmentUseCase
  );
  return { sessionEnvironment, resolve };
}

describe('SessionSpaceEnvironment', () => {
  it("resolves the environment of the feature's repository, not its worktree", async () => {
    const { sessionEnvironment, resolve } = make({
      id: 'feat-1',
      repositoryPath: '/work/acme/api',
    });
    expect(await sessionEnvironment.resolve('feat-1', AgentType.ClaudeCode)).toEqual({
      environment,
    });
    expect(resolve.execute).toHaveBeenCalledWith('/work/acme/api', AgentType.ClaudeCode);
  });

  it('passes on a refusal', async () => {
    const { sessionEnvironment } = make({ id: 'feat-1', repositoryPath: '/work/acme/api' }, 'no');
    expect(await sessionEnvironment.resolve('feat-1', AgentType.CodexCli)).toEqual({
      environment,
      refusal: 'no',
    });
  });

  it('leaves sessions that are not about a feature on the host environment', async () => {
    const { sessionEnvironment, resolve } = make(null);
    expect(await sessionEnvironment.resolve('global', AgentType.ClaudeCode)).toEqual({});
    expect(resolve.execute).not.toHaveBeenCalled();
  });
});
