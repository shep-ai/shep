import { describe, it, expect } from 'vitest';
import {
  parseTabKey,
  VALID_TAB_KEYS,
  deriveInitialTab,
} from '@/components/common/control-center-drawer/drawer-view';
import type { FeatureNodeData } from '@/components/common/feature-node';

describe('parseTabKey', () => {
  it('returns a valid FeatureTabKey for known values', () => {
    expect(parseTabKey('overview')).toBe('overview');
    expect(parseTabKey('activity')).toBe('activity');
    expect(parseTabKey('log')).toBe('log');
    expect(parseTabKey('plan')).toBe('plan');
    expect(parseTabKey('prd-review')).toBe('prd-review');
    expect(parseTabKey('tech-decisions')).toBe('tech-decisions');
    expect(parseTabKey('product-decisions')).toBe('product-decisions');
    expect(parseTabKey('merge-review')).toBe('merge-review');
  });

  it('returns undefined for invalid values', () => {
    expect(parseTabKey('invalid')).toBeUndefined();
    expect(parseTabKey('Overview')).toBeUndefined(); // case-sensitive
    expect(parseTabKey('')).toBeUndefined();
  });

  it('returns undefined for null and undefined', () => {
    expect(parseTabKey(null)).toBeUndefined();
    expect(parseTabKey(undefined)).toBeUndefined();
  });
});

describe('VALID_TAB_KEYS', () => {
  it('contains all 10 tab keys', () => {
    expect(VALID_TAB_KEYS.size).toBe(10);
  });

  it('matches the FeatureTabKey type values', () => {
    const expected = [
      'overview',
      'activity',
      'log',
      'plan',
      'prd-review',
      'tech-decisions',
      'product-decisions',
      'merge-review',
      'prototype',
      'chat',
    ];
    for (const key of expected) {
      expect(VALID_TAB_KEYS.has(key)).toBe(true);
    }
  });
});

describe('deriveInitialTab', () => {
  const baseNode: FeatureNodeData = {
    name: 'Test',
    description: 'Test',
    featureId: '#f1',
    lifecycle: 'implementation',
    state: 'running',
    progress: 50,
    repositoryPath: '/repo',
    branch: 'feat/test',
  };

  it('returns prd-review for requirements + action-required', () => {
    expect(
      deriveInitialTab({ ...baseNode, lifecycle: 'requirements', state: 'action-required' })
    ).toBe('prd-review');
  });

  it('returns tech-decisions for implementation + action-required', () => {
    expect(
      deriveInitialTab({ ...baseNode, lifecycle: 'implementation', state: 'action-required' })
    ).toBe('tech-decisions');
  });

  it('returns merge-review for review + action-required', () => {
    expect(deriveInitialTab({ ...baseNode, lifecycle: 'review', state: 'action-required' })).toBe(
      'merge-review'
    );
  });

  it('returns merge-review for review + error', () => {
    expect(deriveInitialTab({ ...baseNode, lifecycle: 'review', state: 'error' })).toBe(
      'merge-review'
    );
  });

  it('returns overview for other states', () => {
    expect(deriveInitialTab({ ...baseNode, lifecycle: 'implementation', state: 'running' })).toBe(
      'overview'
    );
  });
});
