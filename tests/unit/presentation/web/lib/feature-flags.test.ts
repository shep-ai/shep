// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHasSettings = vi.fn();
const mockGetSettings = vi.fn();

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  hasSettings: () => mockHasSettings(),
  getSettings: () => mockGetSettings(),
}));

const { getFeatureFlags, featureFlags, requireFeatureFlag, FeatureFlagDisabledError } =
  await import('../../../../../src/presentation/web/lib/feature-flags.js');

describe('getFeatureFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_FLAG_ENV_DEPLOY;
    delete process.env.NEXT_PUBLIC_FLAG_REACT_FILE_MANAGER;
    delete process.env.NEXT_PUBLIC_FLAG_PROJECTS;
    delete process.env.NEXT_PUBLIC_FLAG_CODE_REVIEW;
    delete process.env.NEXT_PUBLIC_FLAG_COLLABORATION;
    delete process.env.NEXT_PUBLIC_FLAG_ASPM;
  });

  it('returns DB values when settings has featureFlags', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: {
        envDeploy: false,
        debug: true,
        reactFileManager: false,
      },
    });

    const flags = getFeatureFlags();

    expect(flags.envDeploy).toBe(false);
    expect(flags.debug).toBe(true);
    expect(flags.reactFileManager).toBe(false);
  });

  it('falls back to env vars when featureFlags is undefined', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({});
    process.env.NEXT_PUBLIC_FLAG_ENV_DEPLOY = '1';

    const flags = getFeatureFlags();

    expect(flags.envDeploy).toBe(true);
    expect(flags.debug).toBe(false); // debug has no env var fallback
    expect(flags.reactFileManager).toBe(false);
  });

  it('falls back to env vars when settings not initialized', () => {
    mockHasSettings.mockReturnValue(false);

    const flags = getFeatureFlags();

    expect(flags.envDeploy).toBe(true);
    expect(flags.debug).toBe(false);
    expect(flags.reactFileManager).toBe(false);
  });

  it('falls back to env vars when hasSettings throws', () => {
    mockHasSettings.mockImplementation(() => {
      throw new Error('Not available');
    });

    const flags = getFeatureFlags();

    expect(flags.debug).toBe(false);
    expect(flags.reactFileManager).toBe(false);
  });

  it('defaults envDeploy to true when no settings and no env vars', () => {
    mockHasSettings.mockReturnValue(false);
    delete process.env.NEXT_PUBLIC_FLAG_ENV_DEPLOY;

    const flags = getFeatureFlags();

    expect(flags.envDeploy).toBe(true);
    expect(flags.debug).toBe(false);
    expect(flags.reactFileManager).toBe(false);
  });

  it('debug flag returns false when not in DB (no env var fallback)', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: {
        envDeploy: false,
        debug: false,
        reactFileManager: false,
      },
    });

    const flags = getFeatureFlags();

    expect(flags.debug).toBe(false);
  });

  it('returns reactFileManager from DB when settings exist', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: { envDeploy: false, debug: false, reactFileManager: true },
    });

    const flags = getFeatureFlags();

    expect(flags.reactFileManager).toBe(true);
  });

  it('defaults reactFileManager to false when no settings and no env var', () => {
    mockHasSettings.mockReturnValue(false);

    const flags = getFeatureFlags();

    expect(flags.reactFileManager).toBe(false);
  });

  it('reactFileManager falls back to NEXT_PUBLIC_FLAG_REACT_FILE_MANAGER env var', () => {
    mockHasSettings.mockReturnValue(false);
    process.env.NEXT_PUBLIC_FLAG_REACT_FILE_MANAGER = 'true';

    const flags = getFeatureFlags();

    expect(flags.reactFileManager).toBe(true);
  });

  it('reactFileManager env var fallback accepts "1" as truthy', () => {
    mockHasSettings.mockReturnValue(false);
    process.env.NEXT_PUBLIC_FLAG_REACT_FILE_MANAGER = '1';

    const flags = getFeatureFlags();

    expect(flags.reactFileManager).toBe(true);
  });
});

describe('featureFlags (backward-compatible const)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes envDeploy via getter', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: {
        envDeploy: true,
        debug: false,
        reactFileManager: false,
      },
    });

    expect(featureFlags.envDeploy).toBe(true);
  });

  it('exposes debug via getter', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: {
        envDeploy: false,
        debug: true,
        reactFileManager: false,
      },
    });

    expect(featureFlags.debug).toBe(true);
  });

  it('exposes reactFileManager via getter', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: { envDeploy: false, debug: false, reactFileManager: true },
    });

    expect(featureFlags.reactFileManager).toBe(true);
  });
});

describe('requireFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_FLAG_PROJECTS;
    delete process.env.NEXT_PUBLIC_FLAG_CODE_REVIEW;
    delete process.env.NEXT_PUBLIC_FLAG_COLLABORATION;
    delete process.env.NEXT_PUBLIC_FLAG_ASPM;
  });

  it('returns silently when the flag is enabled', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: {
        envDeploy: false,
        debug: false,
        reactFileManager: false,
        projects: false,
        codeReview: false,
        collaboration: true,
        bedrockIntegration: false,
      },
    });

    expect(() => requireFeatureFlag('collaboration')).not.toThrow();
  });

  it('throws FeatureFlagDisabledError when the flag is off', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: {
        envDeploy: false,
        debug: false,
        reactFileManager: false,
        projects: false,
        codeReview: false,
        collaboration: false,
        bedrockIntegration: false,
      },
    });

    let caught: unknown = null;
    try {
      requireFeatureFlag('collaboration');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FeatureFlagDisabledError);
    expect((caught as InstanceType<typeof FeatureFlagDisabledError>).flag).toBe('collaboration');
    expect((caught as Error).message).toContain('collaboration');
  });

  it('returns silently when settings is not initialized and the flag defaults to true', () => {
    // collaboration / projects / codeReview / aspm all default to TRUE in the
    // env-var fallback (see feature-flags.ts) — they're enabled by default so
    // a fresh install without a DB-persisted settings row still shows them.
    mockHasSettings.mockReturnValue(false);
    expect(() => requireFeatureFlag('collaboration')).not.toThrow();
    expect(() => requireFeatureFlag('projects')).not.toThrow();
    expect(() => requireFeatureFlag('codeReview')).not.toThrow();
    expect(() => requireFeatureFlag('aspm')).not.toThrow();
  });

  it('throws when settings is not initialized and the flag defaults to false', () => {
    mockHasSettings.mockReturnValue(false);
    delete process.env.NEXT_PUBLIC_FLAG_REACT_FILE_MANAGER;
    expect(() => requireFeatureFlag('reactFileManager')).toThrow(FeatureFlagDisabledError);
  });

  it('throws when the flag is explicitly disabled in settings', () => {
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue({
      featureFlags: {
        envDeploy: false,
        debug: false,
        reactFileManager: false,
        projects: false,
        codeReview: false,
        collaboration: false,
        aspm: false,
      },
    });
    expect(() => requireFeatureFlag('aspm')).toThrow(FeatureFlagDisabledError);
  });
});
