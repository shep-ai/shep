/**
 * Deployment-target-type normalization.
 *
 * `dev_servers.target_type` is a plain TEXT column with no constraint, so
 * every value read back from persistence (startup recovery, status listing)
 * is an unvalidated string. `DeploymentTargetType` is the domain vocabulary
 * for those values; this module is the single bridge between the two.
 *
 * Coercing here — rather than casting at each read site — means an
 * unrecognised or legacy value degrades to a known member instead of
 * travelling into the spawn path as a bogus enum.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript
// through Turbopack, which does not map .js back to .ts.
import { DeploymentTargetType } from '../generated/output';

const CANONICAL_TARGET_TYPES = new Set<string>(Object.values(DeploymentTargetType));

/**
 * Coerce a persisted/raw target-type string into a canonical
 * `DeploymentTargetType`.
 *
 * @param value - Raw value from the database, a graph state channel, or a CLI argument.
 * @param fallback - Member to use when the value is absent or unrecognized.
 *                   Defaults to `Repository`, matching the historical
 *                   `IDeploymentService.start()` default.
 */
export function normalizeDeploymentTargetType(
  value: string | null | undefined,
  fallback: DeploymentTargetType = DeploymentTargetType.Repository
): DeploymentTargetType {
  if (!value) return fallback;
  const key = value.trim().toLowerCase();
  return CANONICAL_TARGET_TYPES.has(key) ? (key as DeploymentTargetType) : fallback;
}
