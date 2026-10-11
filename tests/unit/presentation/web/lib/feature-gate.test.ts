import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getFeatureFlagsMock } = vi.hoisted(() => ({ getFeatureFlagsMock: vi.fn() }));

vi.mock('@/lib/feature-flags', () => ({ getFeatureFlags: getFeatureFlagsMock }));

import { FEATURE_OFF_ERROR, featureNotFound, isFeatureOn } from '@/lib/feature-gate';

describe('feature gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is on when its flag is on', () => {
    getFeatureFlagsMock.mockReturnValue({ sdlcBoard: true });
    expect(isFeatureOn('sdlcBoard')).toBe(true);
  });

  it('is off when its flag is off', () => {
    getFeatureFlagsMock.mockReturnValue({ sdlcBoard: false });
    expect(isFeatureOn('sdlcBoard')).toBe(false);
  });

  it('is on when any of several flags is on', () => {
    getFeatureFlagsMock.mockReturnValue({ trackers: false, knowledge: true });
    expect(isFeatureOn('trackers', 'knowledge')).toBe(true);
  });

  it('answers a gated route with a JSON 404', async () => {
    const response = featureNotFound();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found.' });
  });

  it('names the flags view in the error a gated action returns', () => {
    expect(FEATURE_OFF_ERROR).toMatch(/feature flags/i);
  });
});
