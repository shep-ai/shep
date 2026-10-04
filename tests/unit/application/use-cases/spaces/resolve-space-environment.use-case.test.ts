import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ResolveSpaceEnvironmentUseCase } from '@/application/use-cases/spaces/resolve-space-environment.use-case.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { AgentType, SpaceResolutionSource, type Space } from '@/domain/generated/output.js';
import { DEFAULT_SPACE } from '../../../../helpers/space-repositories.mock.js';

const T = new Date('2026-10-01T00:00:00Z');
const ACME: Space = {
  id: 'space-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
  agentSettings: {
    ghConfigDir: '/gh-acme',
    allowedAgentTypes: [AgentType.ClaudeCode, AgentType.Cursor],
  },
  createdAt: T,
  updatedAt: T,
};

function useCaseFor(space: Space): ResolveSpaceEnvironmentUseCase {
  const resolve = {
    execute: vi.fn(async (repositoryPath: string) => ({
      repositoryPath,
      space,
      source: SpaceResolutionSource.Rule,
    })),
  };
  return new ResolveSpaceEnvironmentUseCase(resolve as unknown as ResolveSpaceContextUseCase);
}

describe('ResolveSpaceEnvironmentUseCase', () => {
  it("returns the repository's space and the environment its settings produce", async () => {
    const result = await useCaseFor(ACME).execute('/work/acme/api');
    expect(result.context.space).toEqual(ACME);
    expect(result.environment.set).toEqual({ GH_CONFIG_DIR: '/gh-acme' });
    expect(result.environment.unset).toContain('GH_TOKEN');
    expect(result.agentRefusal).toBeUndefined();
  });

  it('allows a listed agent type', async () => {
    const result = await useCaseFor(ACME).execute('/work/acme/api', AgentType.Cursor);
    expect(result.agentRefusal).toBeUndefined();
  });

  it('refuses an agent type the space does not allow, naming the space and the allowed agents', async () => {
    const result = await useCaseFor(ACME).execute('/work/acme/api', AgentType.CodexCli);
    expect(result.agentRefusal).toBe(
      'The Acme space allows only claude-code, cursor agents; this run uses codex-cli.'
    );
  });

  it('changes nothing for a space without settings', async () => {
    const result = await useCaseFor(DEFAULT_SPACE).execute('/code/blog', AgentType.CodexCli);
    expect(result.environment).toEqual({ set: {}, unset: [] });
    expect(result.agentRefusal).toBeUndefined();
  });
});
