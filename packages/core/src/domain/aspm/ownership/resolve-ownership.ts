/**
 * Pure-domain ownership resolver (feature 098, phase 2).
 *
 * Computes the effective Owner for an asset path by walking sources in a
 * deterministic priority order (research decision 4, FR-4):
 *
 *   1. UI override (highest)
 *   2. .shep/ownership.yaml — most specific path glob match wins
 *   3. Application's listed owner (fallback)
 *   4. null (no resolution — caller may surface OwnerOrphanedFinding)
 *
 * No infra deps: no Date.now(), no filesystem, no env access. Time and
 * I/O cross the boundary as inputs. This is what lets the resolver be a
 * single fixture-driven test instead of a sprawl of integration setups.
 */

import { matchPathGlob, globSpecificity } from './path-glob';

const SOURCE_UI = 'ui' as const;
const SOURCE_YAML = 'yaml' as const;
const SOURCE_APPLICATION = 'application' as const;

export type OwnershipSource = typeof SOURCE_UI | typeof SOURCE_YAML | typeof SOURCE_APPLICATION;

/**
 * A single ownership mapping parsed from .shep/ownership.yaml. Mirrors the
 * generated OwnershipPath value object but allows a partial shape so the
 * resolver can also accept inputs from the YAML reader before all fields
 * have been resolved against the Team/BU graph.
 */
export interface OwnershipYamlEntry {
  pathGlob: string;
  ownerId: string;
  teamId?: string;
  businessUnitId?: string;
  source: typeof SOURCE_YAML;
}

export interface OwnershipYaml {
  entries: OwnershipYamlEntry[];
}

export interface OwnershipResolutionInput {
  /** Repository-relative asset path. Windows separators are normalized. */
  assetPath: string;
  /** UI-declared override owner id, if any. */
  uiOverrideOwnerId?: string;
  /** Parsed .shep/ownership.yaml document (or {entries: []} if absent). */
  ownershipYaml: OwnershipYaml;
  /** Application's listed owner id, used as the final fallback. */
  applicationOwnerId?: string;
}

export interface OwnershipResolutionResult {
  ownerId: string;
  teamId?: string;
  businessUnitId?: string;
  source: OwnershipSource;
  /** The matched glob, when resolution came from YAML. */
  matchedGlob?: string;
}

function normalizePosix(p: string): string {
  return p.replace(/\\/g, '/');
}

export function resolveOwnership(
  input: OwnershipResolutionInput
): OwnershipResolutionResult | null {
  if (input.uiOverrideOwnerId !== undefined && input.uiOverrideOwnerId.length > 0) {
    return { ownerId: input.uiOverrideOwnerId, source: SOURCE_UI };
  }

  const normalized = normalizePosix(input.assetPath);
  const matches = input.ownershipYaml.entries.filter((entry) =>
    matchPathGlob(entry.pathGlob, normalized)
  );

  if (matches.length > 0) {
    // Most specific glob wins (longest non-wildcard prefix). Tiebreaker: the
    // earlier entry in the YAML wins (declaration order is intentional).
    let best = matches[0]!;
    let bestSpec = globSpecificity(best.pathGlob);
    for (let i = 1; i < matches.length; i += 1) {
      const candidate = matches[i]!;
      const candidateSpec = globSpecificity(candidate.pathGlob);
      if (candidateSpec > bestSpec) {
        best = candidate;
        bestSpec = candidateSpec;
      }
    }
    return {
      ownerId: best.ownerId,
      teamId: best.teamId,
      businessUnitId: best.businessUnitId,
      source: SOURCE_YAML,
      matchedGlob: best.pathGlob,
    };
  }

  if (input.applicationOwnerId !== undefined && input.applicationOwnerId.length > 0) {
    return { ownerId: input.applicationOwnerId, source: SOURCE_APPLICATION };
  }

  return null;
}
