/**
 * Shared relevance-ranking scaffolding for memory scorers.
 *
 * Both the lexical and embedding scorers combine the same three signals —
 * a content-match score, phase→category affinity, and recency — into a final
 * relevance score. Only the content-match differs (token overlap vs. cosine
 * similarity), so that part is injected as a function and everything else lives
 * here to avoid duplication.
 */

import type { ProjectMemory } from '../../../domain/generated/output.js';
import type {
  MemoryRelevanceQuery,
  ScoredMemoryEntry,
} from '../../../application/ports/output/services/memory-relevance-scorer.interface.js';
import {
  PHASE_CATEGORY_AFFINITY,
  RELEVANCE_WEIGHTS,
  CATEGORY_AFFINITY_ON,
  CATEGORY_AFFINITY_OFF,
} from '../../../application/use-cases/project-memory/project-memory.constants.js';

export function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function categoryAffinity(phase: string | undefined, category: string): number {
  if (!phase) return CATEGORY_AFFINITY_ON;
  const affinity = PHASE_CATEGORY_AFFINITY[phase];
  if (!affinity) return CATEGORY_AFFINITY_ON; // unknown phase → neutral
  return affinity.includes(category as never) ? CATEGORY_AFFINITY_ON : CATEGORY_AFFINITY_OFF;
}

/** Clamp an arbitrary similarity (e.g. cosine in [-1,1]) into [0,1]. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Rank entries by combining the given per-entry content score (in [0,1]) with
 * phase→category affinity and recency, using the shared weights. Most relevant
 * first; deterministic tie-break by recency then id.
 */
export function rankByContentScore(
  query: MemoryRelevanceQuery,
  entries: ProjectMemory[],
  contentScore: (entry: ProjectMemory) => number
): ScoredMemoryEntry[] {
  if (entries.length === 0) return [];

  const timestamps = entries.map((e) => toMillis(e.updatedAt));
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const span = maxTs - minTs;

  const scored = entries.map((entry) => {
    const content = clamp01(contentScore(entry));
    const category = categoryAffinity(query.phase, entry.category);
    const recency = span === 0 ? 1 : (toMillis(entry.updatedAt) - minTs) / span;

    const score =
      RELEVANCE_WEIGHTS.lexical * content +
      RELEVANCE_WEIGHTS.category * category +
      RELEVANCE_WEIGHTS.recency * recency;

    return { entry, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ts = toMillis(b.entry.updatedAt) - toMillis(a.entry.updatedAt);
    if (ts !== 0) return ts;
    return a.entry.id.localeCompare(b.entry.id);
  });

  return scored;
}
