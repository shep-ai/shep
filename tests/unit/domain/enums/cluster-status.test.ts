/**
 * Unit tests for ClusterStatus enum generated from TypeSpec
 */
import { describe, it, expect } from 'vitest';
import { ClusterStatus } from '../../../../packages/core/src/domain/generated/output';

describe('ClusterStatus enum', () => {
  it('should have all six expected status values', () => {
    expect(ClusterStatus.Provisioning).toBe('Provisioning');
    expect(ClusterStatus.Ready).toBe('Ready');
    expect(ClusterStatus.Stopping).toBe('Stopping');
    expect(ClusterStatus.Stopped).toBe('Stopped');
    expect(ClusterStatus.Error).toBe('Error');
    expect(ClusterStatus.Destroying).toBe('Destroying');
  });

  it('should contain exactly six values', () => {
    const values = Object.values(ClusterStatus);
    expect(values).toHaveLength(6);
  });

  it('should contain all expected status strings', () => {
    const values = Object.values(ClusterStatus);
    expect(values).toContain('Provisioning');
    expect(values).toContain('Ready');
    expect(values).toContain('Stopping');
    expect(values).toContain('Stopped');
    expect(values).toContain('Error');
    expect(values).toContain('Destroying');
  });
});
