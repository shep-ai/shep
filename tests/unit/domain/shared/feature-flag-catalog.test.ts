import { describe, it, expect } from 'vitest';
import {
  FEATURE_FLAG_CATALOG,
  isFeatureFlagKey,
  listFeatureFlagDescriptors,
} from '@/domain/shared/feature-flag-catalog.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { FeatureFlagGroup } from '@/domain/generated/output.js';

const SOFTWARE_FACTORY = [
  'spaces',
  'trackers',
  'knowledge',
  'signals',
  'opportunities',
  'feedback',
  'discovery',
  'incidents',
  'outcomes',
  'docsFirst',
  'autopilot',
  'factory',
];

describe('feature flag catalog', () => {
  it('describes every FeatureFlags key in one line', () => {
    const keys = Object.keys(createDefaultSettings().featureFlags!).sort();
    expect(Object.keys(FEATURE_FLAG_CATALOG).sort()).toEqual(keys);
    for (const descriptor of listFeatureFlagDescriptors()) {
      expect(descriptor.description, descriptor.key).toMatch(/\S/);
      expect(descriptor.description, descriptor.key).not.toContain('\n');
    }
  });

  it('lists the software-factory areas from specs 120–132 under their own group', () => {
    const factory = listFeatureFlagDescriptors()
      .filter((d) => d.group === FeatureFlagGroup.SoftwareFactory)
      .map((d) => d.key);
    expect(factory).toEqual(SOFTWARE_FACTORY);
  });

  it('lists flags grouped in group order', () => {
    const groups = listFeatureFlagDescriptors().map((d) => d.group);
    const order = Object.values(FeatureFlagGroup);
    expect([...groups].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(groups);
  });

  it('recognises flag keys', () => {
    expect(isFeatureFlagKey('spaces')).toBe(true);
    expect(isFeatureFlagKey('supplyChainSecurity')).toBe(false);
    expect(isFeatureFlagKey('toString')).toBe(false);
  });
});
