/**
 * Build-mode normalization.
 *
 * `settings.workflow.defaultMode` predates the `BuildMode` enum: it is
 * persisted as a capitalized label (`'Regular' | 'Fast' | 'Exploration'`)
 * while the enum values are lowercase (`'application' | 'fast' | 'spec' |
 * 'exploration'`). Any consumer that compares the stored setting against
 * `BuildMode` MUST normalize first — `'Fast' === BuildMode.Fast` is `false`,
 * which silently selects the wrong mode (no picker button appears pressed in
 * the create drawer, and the run falls through to the spec workflow).
 *
 * This is the single bridge between the two vocabularies. Persistence keeps
 * writing the legacy labels; every reader funnels through here.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript
// through Turbopack, which does not map .js back to .ts.
import { BuildMode } from '../generated/output';

/** Legacy settings labels that have no identically-named enum value. */
const LEGACY_BUILD_MODE_ALIASES: Readonly<Record<string, BuildMode>> = {
  // 'Regular' was the pre-enum name for the full spec-driven SDLC workflow.
  regular: BuildMode.Spec,
};

const CANONICAL_BUILD_MODES = new Set<string>(Object.values(BuildMode));

/**
 * Coerce any stored/legacy build-mode string into a canonical `BuildMode`.
 *
 * @param value - Raw value from settings, a URL param, or persisted state.
 * @param fallback - Mode to use when the value is absent or unrecognized.
 */
export function normalizeBuildMode(
  value: string | null | undefined,
  fallback: BuildMode = BuildMode.Fast
): BuildMode {
  if (!value) return fallback;
  const key = value.trim().toLowerCase();
  if (CANONICAL_BUILD_MODES.has(key)) return key as BuildMode;
  return LEGACY_BUILD_MODE_ALIASES[key] ?? fallback;
}
