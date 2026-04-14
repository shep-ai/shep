import { describe, it, expect } from 'vitest';
import {
  applicationIdFromFeatureId,
  featureIdForApplication,
  isApplicationFeatureId,
} from '@/domain/shared/feature-id.js';

describe('featureIdForApplication', () => {
  it('prefixes the application id with app-', () => {
    expect(featureIdForApplication('abc123')).toBe('app-abc123');
  });

  it('handles empty id by still returning the prefix', () => {
    expect(featureIdForApplication('')).toBe('app-');
  });
});

describe('applicationIdFromFeatureId', () => {
  it('strips the app- prefix for application feature ids', () => {
    expect(applicationIdFromFeatureId('app-abc123')).toBe('abc123');
  });

  it('returns null for non-application feature ids', () => {
    expect(applicationIdFromFeatureId('feat-xyz')).toBeNull();
    expect(applicationIdFromFeatureId('xyz')).toBeNull();
  });

  it('is the inverse of featureIdForApplication', () => {
    const id = 'some-uuid-1234';
    expect(applicationIdFromFeatureId(featureIdForApplication(id))).toBe(id);
  });
});

describe('isApplicationFeatureId', () => {
  it('returns true only for feature ids starting with app-', () => {
    expect(isApplicationFeatureId('app-anything')).toBe(true);
    expect(isApplicationFeatureId('application-anything')).toBe(false);
    expect(isApplicationFeatureId('feat-anything')).toBe(false);
    expect(isApplicationFeatureId('')).toBe(false);
  });
});
