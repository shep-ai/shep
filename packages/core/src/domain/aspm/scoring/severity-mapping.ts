/**
 * Severity Mapping
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-26. Resolves a
 * concrete CVSS base score for a finding, falling back to the canonical
 * severity table when the finding has no scanner-supplied CVSS (research
 * decision 7 — "Canonical 5-level + preserved raw").
 *
 * Pure function — no infra imports, no `Date.now()`, no env access.
 */

import type { CanonicalSeverity } from '../../generated/output';
import { CANONICAL_SEVERITY_TO_CVSS } from './weights';

/**
 * Resolve a CVSS-equivalent base score in [0, 10] for use in scoring.
 *
 * Priority:
 *   1. Concrete CVSS base score supplied by the scanner (already in [0, 10]).
 *   2. Canonical severity mapped via {@link CANONICAL_SEVERITY_TO_CVSS}.
 */
export function resolveCvssBase(
  cvssBase: number | undefined,
  canonicalSeverity: CanonicalSeverity
): number {
  if (cvssBase !== undefined && Number.isFinite(cvssBase)) {
    return clamp(cvssBase, 0, 10);
  }
  return CANONICAL_SEVERITY_TO_CVSS[canonicalSeverity];
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
