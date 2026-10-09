import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getFeatureFlagsMock, notFoundMock } = vi.hoisted(() => ({
  getFeatureFlagsMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@/lib/feature-flags', () => ({ getFeatureFlags: getFeatureFlagsMock }));

import { requireFeaturePage } from '@/lib/require-feature-page';

describe('requireFeaturePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets the page render while its flag is on', () => {
    getFeatureFlagsMock.mockReturnValue({ spaces: true });
    expect(() => requireFeaturePage('spaces')).not.toThrow();
  });

  it('404s while its flag is off', () => {
    getFeatureFlagsMock.mockReturnValue({ spaces: false });
    expect(() => requireFeaturePage('spaces')).toThrow('NEXT_NOT_FOUND');
  });

  it('renders when any of several flags is on', () => {
    getFeatureFlagsMock.mockReturnValue({ trackers: false, knowledge: true });
    expect(() => requireFeaturePage('trackers', 'knowledge')).not.toThrow();
  });
});
