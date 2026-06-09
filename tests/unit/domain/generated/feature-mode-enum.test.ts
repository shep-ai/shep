/**
 * BuildMode Enum Unit Tests
 *
 * Verifies the BuildMode enum generated from TypeSpec contains
 * the Exploration value (integration of PR #513).
 * Also verifies the Feature type iteration fields for exploration mode.
 */

import { describe, it, expect } from 'vitest';
import { BuildMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

describe('BuildMode enum', () => {
  it('should have Application value', () => {
    expect(BuildMode.Application).toBe('application');
  });

  it('should have Fast value', () => {
    expect(BuildMode.Fast).toBe('fast');
  });

  it('should have Exploration value', () => {
    expect(BuildMode.Exploration).toBe('exploration');
  });

  it('should contain all expected values', () => {
    const values = Object.values(BuildMode);
    expect(values).toEqual(expect.arrayContaining(['application', 'fast', 'exploration']));
  });
});

describe('Feature type buildMode field', () => {
  it('should have a buildMode field of type BuildMode', () => {
    const feature = {
      buildMode: BuildMode.Application,
    } as Partial<Feature>;
    expect(feature.buildMode).toBe('application');
  });

  it('should accept all BuildMode values', () => {
    const regular = { buildMode: BuildMode.Application } as Partial<Feature>;
    const fast = { buildMode: BuildMode.Fast } as Partial<Feature>;
    const exploration = { buildMode: BuildMode.Exploration } as Partial<Feature>;

    expect(regular.buildMode).toBe('application');
    expect(fast.buildMode).toBe('fast');
    expect(exploration.buildMode).toBe('exploration');
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
