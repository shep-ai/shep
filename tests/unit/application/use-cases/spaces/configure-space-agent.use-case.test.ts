import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigureSpaceAgentUseCase } from '@/application/use-cases/spaces/configure-space-agent.use-case.js';
import { AgentType, type Space } from '@/domain/generated/output.js';
import {
  createMockSpaceRepository,
  type MockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';

const T = new Date('2026-10-01T00:00:00Z');
const ACME: Space = {
  id: 'space-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
  agentSettings: { gitAuthorName: 'Me', awsProfile: 'acme' },
  createdAt: T,
  updatedAt: T,
};

describe('ConfigureSpaceAgentUseCase', () => {
  let spaces: MockSpaceRepository;
  let useCase: ConfigureSpaceAgentUseCase;

  beforeEach(() => {
    spaces = createMockSpaceRepository({
      findById: vi.fn(async () => null),
      findBySlug: vi.fn(async (slug: string) => (slug === 'acme' ? ACME : null)),
    });
    useCase = new ConfigureSpaceAgentUseCase(spaces);
  });

  it('merges set fields, keeps unmentioned ones and clears null ones', async () => {
    const result = await useCase.configure('acme', {
      ghConfigDir: '/home/me/.config/gh-acme/',
      gitAuthorEmail: ' me@acme.com ',
      awsProfile: null,
      useBedrock: true,
      allowedAgentTypes: [AgentType.ClaudeCode, AgentType.ClaudeCode],
    });
    expect(result.ok).toBe(true);
    const expected = {
      gitAuthorName: 'Me',
      ghConfigDir: '/home/me/.config/gh-acme',
      gitAuthorEmail: 'me@acme.com',
      useBedrock: true,
      allowedAgentTypes: [AgentType.ClaudeCode],
    };
    expect(spaces.update).toHaveBeenCalledWith(
      expect.objectContaining({ agentSettings: expected })
    );
    if (result.ok) expect(result.space.agentSettings).toEqual(expected);
  });

  it('removes the settings object when every field is cleared', async () => {
    const result = await useCase.configure('acme', { gitAuthorName: null, awsProfile: null });
    expect(result.ok).toBe(true);
    const saved = spaces.update.mock.calls[0][0] as Space;
    expect(saved.agentSettings).toBeUndefined();
  });

  it('clears allowed agents with an empty list', async () => {
    await useCase.configure('acme', { allowedAgentTypes: [] });
    const saved = spaces.update.mock.calls[0][0] as Space;
    expect(saved.agentSettings?.allowedAgentTypes).toBeUndefined();
  });

  it.each([
    [{ claudeConfigDir: 'relative/dir' }, 'absolute'],
    [{ ghConfigDir: '~/gh' }, 'absolute'],
    [{ gitAuthorEmail: 'not-an-email' }, 'email'],
    [{ awsProfile: 'two words' }, 'profile'],
    [{ allowedAgentTypes: ['no-such-agent' as AgentType] }, 'no-such-agent'],
  ])('refuses %o', async (patch, message) => {
    const result = await useCase.configure('acme', patch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
    expect(spaces.update).not.toHaveBeenCalled();
  });

  it('reports an unknown space', async () => {
    const result = await useCase.configure('nope', { gitAuthorName: 'X' });
    expect(result).toEqual({ ok: false, error: 'No space "nope".' });
  });

  it('shows a space with the environment its settings produce', async () => {
    const result = await useCase.show('acme');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.space).toEqual(ACME);
      expect(result.environment.set).toEqual({
        GIT_AUTHOR_NAME: 'Me',
        GIT_COMMITTER_NAME: 'Me',
        AWS_PROFILE: 'acme',
      });
    }
  });
});
