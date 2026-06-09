/**
 * LexicalMemoryRelevanceScorer
 *
 * Deterministic implementation of IMemoryRelevanceScorer — no embeddings, no
 * external calls. Combines three signals into a [0,1] relevance score:
 *
 *   score = wLexical · lexicalOverlap   (entry vs task text)
 *         + wCategory · categoryAffinity (entry.category vs phase)
 *         + wRecency  · recency          (newer entries score slightly higher)
 *
 * This gives per-task, per-phase selection without any provider dependency. A
 * semantic scorer can later implement the same port for richer matching.
 */

import { injectable } from 'tsyringe';
import type { ProjectMemory } from '../../../domain/generated/output.js';
import type {
  IMemoryRelevanceScorer,
  MemoryRelevanceQuery,
  ScoredMemoryEntry,
} from '../../../application/ports/output/services/memory-relevance-scorer.interface.js';
import {
  PHASE_CATEGORY_AFFINITY,
  RELEVANCE_WEIGHTS,
  CATEGORY_AFFINITY_ON,
  CATEGORY_AFFINITY_OFF,
  RELEVANCE_STOPWORDS,
} from '../../../application/use-cases/project-memory/project-memory.constants.js';

const MIN_TOKEN_LENGTH = 3;

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= MIN_TOKEN_LENGTH && !RELEVANCE_STOPWORDS.has(raw)) {
      tokens.add(raw);
    }
  }
  return tokens;
}

/** Saturating overlap → [0,1): 1 match ≈ 0.33, 2 ≈ 0.5, 4 ≈ 0.67. */
function lexicalScore(queryTokens: Set<string>, entryText: string): number {
  if (queryTokens.size === 0) return 0;
  const entryTokens = tokenize(entryText);
  let overlap = 0;
  for (const t of queryTokens) {
    if (entryTokens.has(t)) overlap += 1;
  }
  return overlap === 0 ? 0 : overlap / (overlap + 2);
}

function categoryAffinity(phase: string | undefined, category: string): number {
  if (!phase) return CATEGORY_AFFINITY_ON;
  const affinity = PHASE_CATEGORY_AFFINITY[phase];
  if (!affinity) return CATEGORY_AFFINITY_ON; // unknown phase → neutral
  return affinity.includes(category as never) ? CATEGORY_AFFINITY_ON : CATEGORY_AFFINITY_OFF;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

@injectable()
export class LexicalMemoryRelevanceScorer implements IMemoryRelevanceScorer {
  async score(query: MemoryRelevanceQuery, entries: ProjectMemory[]): Promise<ScoredMemoryEntry[]> {
    if (entries.length === 0) return [];

    const queryTokens = tokenize(query.taskText ?? '');

    const timestamps = entries.map((e) => toMillis(e.updatedAt));
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const span = maxTs - minTs;

    const scored = entries.map((entry) => {
      const lexical = lexicalScore(queryTokens, `${entry.content} ${entry.entryKey}`);
      const category = categoryAffinity(query.phase, entry.category);
      const recency = span === 0 ? 1 : (toMillis(entry.updatedAt) - minTs) / span;

      const score =
        RELEVANCE_WEIGHTS.lexical * lexical +
        RELEVANCE_WEIGHTS.category * category +
        RELEVANCE_WEIGHTS.recency * recency;

      return { entry, score };
    });

    // Most relevant first; deterministic tie-break by recency then id.
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ts = toMillis(b.entry.updatedAt) - toMillis(a.entry.updatedAt);
      if (ts !== 0) return ts;
      return a.entry.id.localeCompare(b.entry.id);
    });

    return scored;
  }
}
