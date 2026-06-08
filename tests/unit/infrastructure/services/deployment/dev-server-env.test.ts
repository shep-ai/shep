// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DEV_SERVER_ENV_BLOCKLIST,
  buildDevServerEnv,
} from '@/infrastructure/services/deployment/dev-server-env.js';

describe('buildDevServerEnv', () => {
  it('strips cli-only vars that must not leak into user dev servers', () => {
    const base = {
      PATH: '/usr/bin',
      NODE_ENV: 'production' as const,
      NEXT_ASSET_PREFIX: '/cli',
      PORT: '3000',
      CLAUDE_CODE_OAUTH_TOKEN: 'secret',
      ANTHROPIC_API_KEY: 'secret',
      ANTHROPIC_AUTH_TOKEN: 'secret',
    };

    const env = buildDevServerEnv(base);

    for (const key of DEV_SERVER_ENV_BLOCKLIST) {
      expect(env[key]).toBeUndefined();
    }
    // Unrelated vars are preserved.
    expect(env.PATH).toBe('/usr/bin');
    expect(env.NODE_ENV).toBe('production');
  });

  it('keeps HOST/HOSTNAME (needed so dev servers bind 0.0.0.0 for the preview proxy)', () => {
    const env = buildDevServerEnv({ HOST: '0.0.0.0', HOSTNAME: '0.0.0.0' });
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.HOSTNAME).toBe('0.0.0.0');
  });

  it('applies overrides on top of the scrubbed env', () => {
    const env = buildDevServerEnv({ NEXT_ASSET_PREFIX: '/cli' }, { SHEP_SKIP_RECOVERY: '1' });
    expect(env.NEXT_ASSET_PREFIX).toBeUndefined();
    expect(env.SHEP_SKIP_RECOVERY).toBe('1');
  });

  it('does not mutate the input env', () => {
    const base = { NEXT_ASSET_PREFIX: '/cli' };
    buildDevServerEnv(base);
    expect(base.NEXT_ASSET_PREFIX).toBe('/cli');
  });
});
