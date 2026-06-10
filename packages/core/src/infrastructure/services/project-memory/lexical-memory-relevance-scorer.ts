/**
 * LexicalMemoryRelevanceScorer
 *
 * Deterministic implementation of IMemoryRelevanceScorer — no embeddings, no
 * external calls. The content-match signal is lexical overlap between the entry
 * and the task text; phase→category affinity and recency are combined in via the
 * shared ranking helper. Used directly when no embedding provider is configured,
 * and as the fallback inside EmbeddingMemoryRelevanceScorer.
 */

import { injectable } from 'tsyringe';
import type { ProjectMemory } from '../../../domain/generated/output.js';
import type {
  IMemoryRelevanceScorer,
  MemoryRelevanceQuery,
  ScoredMemoryEntry,
} from '../../../application/ports/output/services/memory-relevance-scorer.interface.js';
import { RELEVANCE_STOPWORDS } from '../../../application/use-cases/project-memory/project-memory.constants.js';
import { rankByContentScore } from './relevance-ranking.js';

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

@injectable()
export class LexicalMemoryRelevanceScorer implements IMemoryRelevanceScorer {
  async score(query: MemoryRelevanceQuery, entries: ProjectMemory[]): Promise<ScoredMemoryEntry[]> {
    const queryTokens = tokenize(query.taskText ?? '');
    return rankByContentScore(query, entries, (entry: ProjectMemory) =>
      lexicalScore(queryTokens, `${entry.content} ${entry.entryKey}`)
    );
  }
}
