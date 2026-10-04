import { describe, it, expect, vi } from 'vitest';
import { applyRunSpaceEnvironment } from '@/infrastructure/services/agents/feature-agent/apply-space-environment.js';
import type { ResolvedSpaceEnvironment } from '@/application/use-cases/spaces/resolve-space-environment.use-case.js';
import { AgentType, SpaceResolutionSource } from '@/domain/generated/output.js';

const T = new Date('2026-10-01T00:00:00Z');

function resolved(over: Partial<ResolvedSpaceEnvironment> = {}): ResolvedSpaceEnvironment {
  return {
    context: {
      repositoryPath: '/work/acme/api',
      space: { id: 's', name: 'Acme', slug: 'acme', isDefault: false, createdAt: T, updatedAt: T },
      source: SpaceResolutionSource.Rule,
    },
    environment: {
      set: { GH_CONFIG_DIR: '/gh-acme', GIT_AUTHOR_EMAIL: 'me@acme.com' },
      unset: ['GH_TOKEN', 'GITHUB_TOKEN'],
    },
    ...over,
  };
}

describe('applyRunSpaceEnvironment', () => {
  it("applies the repository's space environment to the given env in place", async () => {
    const env: Record<string, string | undefined> = { PATH: '/bin', GH_TOKEN: 'host-secret' };
    const resolveEnvironment = vi.fn().mockResolvedValue(resolved());
    const log = vi.fn();

    const result = await applyRunSpaceEnvironment({
      resolveEnvironment,
      repositoryPath: '/work/acme/api',
      agentType: AgentType.ClaudeCode,
      env,
      log,
    });

    expect(result).toEqual({});
    expect(resolveEnvironment).toHaveBeenCalledWith('/work/acme/api', AgentType.ClaudeCode);
    expect(env).toEqual({
      PATH: '/bin',
      GH_CONFIG_DIR: '/gh-acme',
      GIT_AUTHOR_EMAIL: 'me@acme.com',
    });
  });

  it('logs variable names but never their values', async () => {
    const log = vi.fn();
    await applyRunSpaceEnvironment({
      resolveEnvironment: vi.fn().mockResolvedValue(resolved()),
      repositoryPath: '/work/acme/api',
      agentType: AgentType.ClaudeCode,
      env: { GH_TOKEN: 'host-secret' },
      log,
    });
    const logged = log.mock.calls.flat().join('\n');
    expect(logged).toContain('Acme');
    expect(logged).toContain('GH_CONFIG_DIR');
    expect(logged).toContain('GH_TOKEN');
    expect(logged).not.toContain('host-secret');
    expect(logged).not.toContain('me@acme.com');
  });

  it('returns the refusal and leaves the env untouched when the agent is not allowed', async () => {
    const env: Record<string, string | undefined> = { GH_TOKEN: 'host-secret' };
    const result = await applyRunSpaceEnvironment({
      resolveEnvironment: vi
        .fn()
        .mockResolvedValue(
          resolved({ agentRefusal: 'The Acme space allows only claude-code agents' })
        ),
      repositoryPath: '/work/acme/api',
      agentType: AgentType.CodexCli,
      env,
      log: vi.fn(),
    });
    expect(result.refusal).toContain('allows only claude-code');
    expect(env).toEqual({ GH_TOKEN: 'host-secret' });
  });

  it('logs nothing about variables for a space without settings', async () => {
    const log = vi.fn();
    const env = { PATH: '/bin' };
    await applyRunSpaceEnvironment({
      resolveEnvironment: vi
        .fn()
        .mockResolvedValue(resolved({ environment: { set: {}, unset: [] } })),
      repositoryPath: '/code/blog',
      agentType: AgentType.ClaudeCode,
      env,
      log,
    });
    expect(env).toEqual({ PATH: '/bin' });
    expect(log.mock.calls.flat().join('\n')).not.toContain('set ');
  });
});
