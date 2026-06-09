/**
 * Tests for the pure-domain ownership resolver (feature 098, phase 2).
 *
 * Resolution priority (research decision 4 + FR-4):
 *   1. UI-declared override (highest)
 *   2. .shep/ownership.yaml — most specific path glob match wins
 *   3. Application's listed owner (fallback)
 *   4. null if no resolution
 */

import { describe, it, expect } from 'vitest';
import {
  resolveOwnership,
  type OwnershipResolutionInput,
} from '@/domain/aspm/ownership/resolve-ownership.js';

describe('resolveOwnership', () => {
  it('returns the UI override when present, ignoring YAML and application fallback', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/api/users.ts',
      uiOverrideOwnerId: 'ui-owner',
      ownershipYaml: {
        entries: [{ pathGlob: 'src/**', ownerId: 'yaml-owner', source: 'yaml' }],
      },
      applicationOwnerId: 'app-owner',
    };
    const result = resolveOwnership(input);
    expect(result).not.toBeNull();
    expect(result!.ownerId).toBe('ui-owner');
    expect(result!.source).toBe('ui');
  });

  it('returns the YAML match when no UI override is given', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/api/users.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [{ pathGlob: 'src/**', ownerId: 'yaml-owner', source: 'yaml' }],
      },
      applicationOwnerId: 'app-owner',
    };
    const result = resolveOwnership(input);
    expect(result!.ownerId).toBe('yaml-owner');
    expect(result!.source).toBe('yaml');
  });

  it('returns the application fallback when no UI override and no YAML match', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'unmatched/path.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: { entries: [{ pathGlob: 'src/**', ownerId: 'src-owner', source: 'yaml' }] },
      applicationOwnerId: 'app-owner',
    };
    const result = resolveOwnership(input);
    expect(result!.ownerId).toBe('app-owner');
    expect(result!.source).toBe('application');
  });

  it('returns null when no UI override, no YAML match, and no application owner', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'nothing/here.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: { entries: [] },
      applicationOwnerId: undefined,
    };
    expect(resolveOwnership(input)).toBeNull();
  });

  it('picks the most specific glob (longest non-wildcard prefix) when multiple YAML entries match', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/api/users/handler.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [
          { pathGlob: 'src/**', ownerId: 'broad', source: 'yaml' },
          { pathGlob: 'src/api/**', ownerId: 'api-team', source: 'yaml' },
          { pathGlob: 'src/api/users/**', ownerId: 'users-team', source: 'yaml' },
        ],
      },
      applicationOwnerId: 'app-owner',
    };
    const result = resolveOwnership(input);
    expect(result!.ownerId).toBe('users-team');
  });

  it('handles wildcards: src/*.ts matches a top-level src ts file', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/server.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [{ pathGlob: 'src/*.ts', ownerId: 'src-flat', source: 'yaml' }],
      },
      applicationOwnerId: undefined,
    };
    const result = resolveOwnership(input);
    expect(result!.ownerId).toBe('src-flat');
  });

  it('handles wildcards: src/*.ts does NOT match a nested file', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/sub/server.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [{ pathGlob: 'src/*.ts', ownerId: 'src-flat', source: 'yaml' }],
      },
      applicationOwnerId: 'fallback',
    };
    const result = resolveOwnership(input);
    expect(result!.ownerId).toBe('fallback');
  });

  it('matches exact glob (no wildcards) only on exact equality', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/index.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [
          { pathGlob: 'src/index.ts', ownerId: 'exact', source: 'yaml' },
          { pathGlob: 'src/**', ownerId: 'broad', source: 'yaml' },
        ],
      },
      applicationOwnerId: undefined,
    };
    const result = resolveOwnership(input);
    expect(result!.ownerId).toBe('exact');
  });

  it('normalizes Windows-style asset paths before matching', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src\\api\\users.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [{ pathGlob: 'src/api/**', ownerId: 'api', source: 'yaml' }],
      },
      applicationOwnerId: undefined,
    };
    const result = resolveOwnership(input);
    expect(result!.ownerId).toBe('api');
  });

  it('propagates team and businessUnit from the matching YAML entry', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/api/x.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [
          {
            pathGlob: 'src/api/**',
            ownerId: 'api-owner',
            teamId: 'team-1',
            businessUnitId: 'bu-1',
            source: 'yaml',
          },
        ],
      },
      applicationOwnerId: undefined,
    };
    const result = resolveOwnership(input);
    expect(result!.teamId).toBe('team-1');
    expect(result!.businessUnitId).toBe('bu-1');
  });

  it('is deterministic: same input always produces same output', () => {
    const input: OwnershipResolutionInput = {
      assetPath: 'src/api/users.ts',
      uiOverrideOwnerId: undefined,
      ownershipYaml: {
        entries: [
          { pathGlob: 'src/api/**', ownerId: 'api', source: 'yaml' },
          { pathGlob: 'src/**', ownerId: 'broad', source: 'yaml' },
        ],
      },
      applicationOwnerId: 'fallback',
    };
    const first = resolveOwnership(input);
    const second = resolveOwnership(input);
    const third = resolveOwnership(input);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });
});
