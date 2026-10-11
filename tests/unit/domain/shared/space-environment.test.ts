import { describe, it, expect } from 'vitest';
import {
  applySpaceEnvironment,
  isAgentAllowedInSpace,
  spaceEnvironment,
  spaceAgent,
} from '@/domain/shared/space-environment.js';
import { AgentType } from '@/domain/generated/output.js';

describe('spaceEnvironment', () => {
  it('changes nothing for a space without settings', () => {
    expect(spaceEnvironment(undefined)).toEqual({ set: {}, unset: [] });
    expect(spaceEnvironment({})).toEqual({ set: {}, unset: [] });
  });

  it('points Claude at the space config dir and drops host credentials that would win', () => {
    const env = spaceEnvironment({ claudeConfigDir: '/home/me/.claude-acme' });
    expect(env.set).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-acme' });
    expect(env.unset).toEqual(
      expect.arrayContaining([
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'CLAUDE_CODE_OAUTH_TOKEN',
      ])
    );
  });

  it('points gh at the space config dir and drops host GitHub tokens', () => {
    const env = spaceEnvironment({ ghConfigDir: '/home/me/.config/gh-acme' });
    expect(env.set).toEqual({ GH_CONFIG_DIR: '/home/me/.config/gh-acme' });
    expect(env.unset).toEqual(
      expect.arrayContaining([
        'GH_TOKEN',
        'GITHUB_TOKEN',
        'GH_ENTERPRISE_TOKEN',
        'GITHUB_ENTERPRISE_TOKEN',
      ])
    );
  });

  it('sets the git author and committer identity', () => {
    expect(spaceEnvironment({ gitAuthorName: 'Me', gitAuthorEmail: 'me@acme.com' }).set).toEqual({
      GIT_AUTHOR_NAME: 'Me',
      GIT_COMMITTER_NAME: 'Me',
      GIT_AUTHOR_EMAIL: 'me@acme.com',
      GIT_COMMITTER_EMAIL: 'me@acme.com',
    });
  });

  it('turns Bedrock on, off, or leaves it to the host', () => {
    expect(spaceEnvironment({ useBedrock: true, awsProfile: 'acme' }).set).toEqual({
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_PROFILE: 'acme',
    });
    expect(spaceEnvironment({ useBedrock: false }).unset).toEqual(['CLAUDE_CODE_USE_BEDROCK']);
    expect(spaceEnvironment({ awsProfile: 'acme' }).unset).toEqual([]);
  });
});

describe('applySpaceEnvironment', () => {
  it('sets, removes and keeps everything else, without touching the input', () => {
    const base = { PATH: '/bin', GH_TOKEN: 'host-token', HOME: '/home/me' };
    const result = applySpaceEnvironment(base, spaceEnvironment({ ghConfigDir: '/gh' }));
    expect(result).toEqual({ PATH: '/bin', HOME: '/home/me', GH_CONFIG_DIR: '/gh' });
    expect(base.GH_TOKEN).toBe('host-token');
  });
});

describe('isAgentAllowedInSpace', () => {
  it('allows every agent when no list is set', () => {
    expect(isAgentAllowedInSpace(undefined, AgentType.CodexCli)).toBe(true);
    expect(isAgentAllowedInSpace({ allowedAgentTypes: [] }, AgentType.CodexCli)).toBe(true);
  });

  it('allows only the listed agents', () => {
    const settings = { allowedAgentTypes: [AgentType.ClaudeCode] };
    expect(isAgentAllowedInSpace(settings, AgentType.ClaudeCode)).toBe(true);
    expect(isAgentAllowedInSpace(settings, AgentType.CodexCli)).toBe(false);
  });
});

describe('spaceAgent', () => {
  it('uses the named agent when the space allows it, else refuses', () => {
    const settings = { allowedAgentTypes: [AgentType.CodexCli, AgentType.ClaudeCode] };
    expect(spaceAgent(settings, AgentType.ClaudeCode)).toEqual({
      ok: true,
      agentType: AgentType.ClaudeCode,
    });
    expect(spaceAgent(settings, AgentType.Cursor)).toEqual({ ok: false });
  });

  it('picks the first allowed agent, or leaves the default when every agent is allowed', () => {
    expect(spaceAgent({ allowedAgentTypes: [AgentType.CodexCli] })).toEqual({
      ok: true,
      agentType: AgentType.CodexCli,
    });
    expect(spaceAgent(undefined)).toEqual({ ok: true });
  });
});
