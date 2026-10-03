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
import {
  lexicalOverlapScore,
  tokenizeForRelevance,
} from '../../../domain/shared/lexical-relevance.js';

function tokenize(text: string): Set<string> {
  return tokenizeForRelevance(text, RELEVANCE_STOPWORDS);
}

function lexicalScore(queryTokens: Set<string>, entryText: string): number {
  return lexicalOverlapScore(queryTokens, entryText, RELEVANCE_STOPWORDS);
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
