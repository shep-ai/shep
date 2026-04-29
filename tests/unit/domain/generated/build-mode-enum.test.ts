/**
 * BuildMode Enum Unit Tests
 *
 * Verifies the BuildMode enum generated from TypeSpec maps each member
 * to its lowercase string value, matching the existing UI `BuildMode`
 * union (`'application' | 'fast' | 'spec'`) so URL params and stored
 * payloads remain wire-compatible.
 */

import { describe, it, expect } from 'vitest';
import { BuildMode } from '@/domain/generated/output.js';

describe('BuildMode enum', () => {
  it('should have exactly 3 values', () => {
    const values = Object.values(BuildMode);
    expect(values).toHaveLength(3);
  });

  it('should map Application to "application"', () => {
    expect(BuildMode.Application).toBe('application');
  });

  it('should map Fast to "fast"', () => {
    expect(BuildMode.Fast).toBe('fast');
  });

  it('should map Spec to "spec"', () => {
    expect(BuildMode.Spec).toBe('spec');
  });

  it('should contain all expected lowercase string values', () => {
    const values = Object.values(BuildMode);
    expect(values).toEqual(expect.arrayContaining(['application', 'fast', 'spec']));
  });
});
