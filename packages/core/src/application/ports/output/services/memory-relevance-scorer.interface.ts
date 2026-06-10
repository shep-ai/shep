/**
 * IMemoryRelevanceScorer (Output Port)
 *
 * Ranks project-memory entries by relevance to the current task/phase so callers
 * inject only the pertinent subset into an agent prompt instead of the whole
 * store. This is the pluggable seam for relevance: a deterministic lexical+phase
 * scorer ships today; a semantic (embedding-based) scorer can implement the same
 * port later without touching callers.
 */

import type { ProjectMemory } from '../../../../domain/generated/output.js';

export interface MemoryRelevanceQuery {
  /**
   * Free text describing the current focus — the spec/feature description, the
   * user query, or (for the CI-fix agent) the failure logs. Drives lexical
   * ranking. May be empty, in which case ranking falls back to category + recency.
   */
  taskText: string;
  /**
   * The consuming phase / agent prompt (e.g. 'analyze', 'implement', 'ci-fix',
   * 'interactive'). Drives category-affinity weighting. Optional.
   */
  phase?: string;
}

export interface ScoredMemoryEntry {
  entry: ProjectMemory;
  /** Relevance score in [0, 1]; higher is more relevant. */
  score: number;
}

export interface IMemoryRelevanceScorer {
  /**
   * Score and rank the given entries against the query, most-relevant first.
   * Implementations must be pure with respect to the inputs (no mutation) and
   * must return one ScoredMemoryEntry per input entry.
   */
  score(query: MemoryRelevanceQuery, entries: ProjectMemory[]): Promise<ScoredMemoryEntry[]>;
}
