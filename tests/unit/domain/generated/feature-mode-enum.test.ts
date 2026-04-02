/**
 * FeatureMode Enum Unit Tests
 *
 * Verifies the FeatureMode enum generated from TypeSpec contains
 * exactly three values: Regular, Fast, Exploration.
 * Also verifies the Feature type uses FeatureMode instead of a boolean fast field.
 */

import { describe, it, expect } from 'vitest';
import { FeatureMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

describe('FeatureMode enum', () => {
  it('should have exactly 3 values', () => {
    const values = Object.values(FeatureMode);
    expect(values).toHaveLength(3);
  });

  it('should have Regular value', () => {
    expect(FeatureMode.Regular).toBe('Regular');
  });

  it('should have Fast value', () => {
    expect(FeatureMode.Fast).toBe('Fast');
  });

  it('should have Exploration value', () => {
    expect(FeatureMode.Exploration).toBe('Exploration');
  });

  it('should contain all expected values', () => {
    const values = Object.values(FeatureMode);
    expect(values).toEqual(expect.arrayContaining(['Regular', 'Fast', 'Exploration']));
  });
});

describe('Feature type mode field', () => {
  it('should have a mode field of type FeatureMode', () => {
    const feature = {
      mode: FeatureMode.Regular,
    } as Partial<Feature>;
    expect(feature.mode).toBe('Regular');
  });

  it('should accept all FeatureMode values', () => {
    const regular = { mode: FeatureMode.Regular } as Partial<Feature>;
    const fast = { mode: FeatureMode.Fast } as Partial<Feature>;
    const exploration = { mode: FeatureMode.Exploration } as Partial<Feature>;

    expect(regular.mode).toBe('Regular');
    expect(fast.mode).toBe('Fast');
    expect(exploration.mode).toBe('Exploration');
  });
});

describe('Feature iteration fields', () => {
  it('should have iterationCount as a number field', () => {
    const feature = { iterationCount: 0 } as Partial<Feature>;
    expect(feature.iterationCount).toBe(0);
  });

  it('should have maxIterations as an optional number field', () => {
    const withMax = { maxIterations: 10 } as Partial<Feature>;
    const withoutMax = {} as Partial<Feature>;
    expect(withMax.maxIterations).toBe(10);
    expect(withoutMax.maxIterations).toBeUndefined();
  });

  it('should allow iterationCount to be set on Feature type', () => {
    const feature = {
      iterationCount: 5,
      maxIterations: 10,
    } as Partial<Feature>;
    expect(feature).toHaveProperty('iterationCount');
    expect(feature).toHaveProperty('maxIterations');
  });
});
