/**
 * Visibility ladder for the query-aware harness (spec 119).
 *
 * A chunk is shown to a model call at one of four levels. The levels are
 * ordered, so the context engine can escalate (short → long → full) when the
 * model asks for more detail and downgrade when the plan is over budget.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { ChunkVisibility } from '../generated/output';

/** Every level, from least to most visible. */
export const VISIBILITY_ORDER: readonly ChunkVisibility[] = [
  ChunkVisibility.Hidden,
  ChunkVisibility.Short,
  ChunkVisibility.Long,
  ChunkVisibility.Full,
];

/** Score bands that map a relevance score to a visibility level. */
export interface VisibilityBands {
  hideThreshold: number;
  longThreshold: number;
  fullThreshold: number;
  uncertainDefault: ChunkVisibility;
}

function rank(visibility: ChunkVisibility): number {
  return VISIBILITY_ORDER.indexOf(visibility);
}

/** Negative when `a` is less visible than `b`, positive when more, 0 when equal. */
export function compareVisibility(a: ChunkVisibility, b: ChunkVisibility): number {
  return rank(a) - rank(b);
}

/** One level more visible; full stays full. */
export function escalateVisibility(visibility: ChunkVisibility): ChunkVisibility {
  return VISIBILITY_ORDER[Math.min(rank(visibility) + 1, VISIBILITY_ORDER.length - 1)];
}

/** One level less visible; hidden stays hidden. */
export function downgradeVisibility(visibility: ChunkVisibility): ChunkVisibility {
  return VISIBILITY_ORDER[Math.max(rank(visibility) - 1, 0)];
}

/** The more visible of two levels. */
export function maxVisibility(a: ChunkVisibility, b: ChunkVisibility): ChunkVisibility {
  return compareVisibility(a, b) >= 0 ? a : b;
}

/**
 * Map a relevance score in [0, 1] to a level:
 * hidden < hideThreshold ≤ short < longThreshold ≤ long < fullThreshold ≤ full.
 * A missing score (no provider could judge the chunk) uses the uncertain
 * default, which is conservative by design.
 */
export function visibilityForScore(
  score: number | undefined,
  bands: VisibilityBands
): ChunkVisibility {
  if (score === undefined || Number.isNaN(score)) return bands.uncertainDefault;
  if (score < bands.hideThreshold) return ChunkVisibility.Hidden;
  if (score < bands.longThreshold) return ChunkVisibility.Short;
  if (score < bands.fullThreshold) return ChunkVisibility.Long;
  return ChunkVisibility.Full;
}
