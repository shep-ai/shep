import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AgentType } from '@/domain/generated/output.js';
import { CatalogTelemetryIdentityProvider } from '@/infrastructure/services/telemetry/catalog-telemetry-identity-provider.js';
import { removeDirWithRetry } from '../../../../helpers/remove-dir.helper.js';
import { createFakeClock } from '../../../../helpers/telemetry.helper.js';

const NOW = new Date('2026-10-09T12:00:00Z');

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('CatalogTelemetryIdentityProvider', () => {
  let home: string;
  let env: Record<string, string | undefined>;
  let getAuthenticatedUser: Mock<() => Promise<string>>;
  let listRepositories: Mock<() => Promise<(string | undefined)[]>>;
  let clock: ReturnType<typeof createFakeClock>;

  function provider() {
    return new CatalogTelemetryIdentityProvider({
      homeDir: () => home,
      env: () => env,
      sha256,
      clock,
      getGitHubUsername: getAuthenticatedUser,
      listRemoteUrls: listRepositories,
    });
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'shep-identity-'));
    env = {};
    getAuthenticatedUser = vi.fn<() => Promise<string>>(async () => 'octo');
    listRepositories = vi.fn<() => Promise<(string | undefined)[]>>(async () => [
      'git@github.com:Acme/one.git',
      'https://github.com/zeta/two',
      undefined,
    ]);
    clock = createFakeClock(NOW);
  });

  afterEach(() => removeDirWithRetry(home));

  it('hashes the Claude account id from ~/.claude.json and never returns it raw', async () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ userID: 'claude-user-42' }));
    const identity = await provider().resolve(AgentType.ClaudeCode);

    expect(identity).toEqual({
      agentAccountHash: sha256('claude-code:claude-user-42'),
      agentAccountSource: AgentType.ClaudeCode,
      githubUsername: 'octo',
      githubOwners: ['acme', 'zeta'],
    });
    expect(JSON.stringify(identity)).not.toContain('claude-user-42');
  });

  it('reads Codex from ~/.codex/auth.json tokens.account_id, preferring the configured agent', async () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ userID: 'c' }));
    mkdirSync(join(home, '.codex'));
    writeFileSync(
      join(home, '.codex', 'auth.json'),
      JSON.stringify({ tokens: { account_id: 'acct-9' } })
    );

    const identity = await provider().resolve(AgentType.CodexCli);
    expect(identity.agentAccountSource).toBe(AgentType.CodexCli);
    expect(identity.agentAccountHash).toBe(sha256('codex-cli:acct-9'));
  });

  it('honours CLAUDE_CONFIG_DIR and CODEX_HOME', async () => {
    const elsewhere = join(home, 'custom');
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, '.claude.json'), JSON.stringify({ userID: 'moved' }));
    env = { CLAUDE_CONFIG_DIR: elsewhere };

    const identity = await provider().resolve(AgentType.ClaudeCode);
    expect(identity.agentAccountHash).toBe(sha256('claude-code:moved'));
  });

  it('falls back to another agent and then to no hash, ignoring malformed files', async () => {
    writeFileSync(join(home, '.claude.json'), '{not json');
    const identity = await provider().resolve(AgentType.ClaudeCode);
    expect(identity.agentAccountHash).toBeUndefined();
    expect(identity.agentAccountSource).toBeUndefined();
  });

  it('leaves the username out when gh fails, and owners empty without remotes', async () => {
    getAuthenticatedUser.mockRejectedValue(new Error('gh: not logged in'));
    listRepositories.mockResolvedValue([]);
    expect(await provider().resolve(AgentType.ClaudeCode)).toEqual({ githubOwners: [] });
  });

  it('caches for a day', async () => {
    const identityProvider = provider();
    await identityProvider.resolve(AgentType.ClaudeCode);
    await identityProvider.resolve(AgentType.ClaudeCode);
    expect(getAuthenticatedUser).toHaveBeenCalledTimes(1);

    clock.set(new Date(NOW.getTime() + 24 * 60 * 60 * 1000));
    await identityProvider.resolve(AgentType.ClaudeCode);
    expect(getAuthenticatedUser).toHaveBeenCalledTimes(2);
  });
});
