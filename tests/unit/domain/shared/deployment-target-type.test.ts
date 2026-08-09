/**
 * normalizeDeploymentTargetType Unit Tests
 *
 * `dev_servers.target_type` is a plain TEXT column, so every value read back
 * from the database (recovery, status listing) arrives as an unvalidated
 * string. This is the single bridge from that raw string to the
 * DeploymentTargetType enum — an unrecognised value must degrade to the
 * fallback, never leak an invalid enum member into the spawn path.
 */

import { describe, it, expect } from 'vitest';
import { DeploymentTargetType } from '@/domain/generated/output.js';
import { normalizeDeploymentTargetType } from '@/domain/shared/deployment-target-type.js';

describe('normalizeDeploymentTargetType', () => {
  it('returns the matching enum member for each canonical value', () => {
    expect(normalizeDeploymentTargetType('application')).toBe(DeploymentTargetType.Application);
    expect(normalizeDeploymentTargetType('feature')).toBe(DeploymentTargetType.Feature);
    expect(normalizeDeploymentTargetType('repository')).toBe(DeploymentTargetType.Repository);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeDeploymentTargetType('  Feature  ')).toBe(DeploymentTargetType.Feature);
    expect(normalizeDeploymentTargetType('APPLICATION')).toBe(DeploymentTargetType.Application);
  });

  it('falls back to Repository for absent values', () => {
    expect(normalizeDeploymentTargetType(undefined)).toBe(DeploymentTargetType.Repository);
    expect(normalizeDeploymentTargetType(null)).toBe(DeploymentTargetType.Repository);
    expect(normalizeDeploymentTargetType('')).toBe(DeploymentTargetType.Repository);
  });

  it('falls back for an unrecognised value rather than casting it through', () => {
    expect(normalizeDeploymentTargetType('workspace')).toBe(DeploymentTargetType.Repository);
  });

  it('honours an explicit fallback', () => {
    expect(normalizeDeploymentTargetType('nonsense', DeploymentTargetType.Feature)).toBe(
      DeploymentTargetType.Feature
    );
  });
});
