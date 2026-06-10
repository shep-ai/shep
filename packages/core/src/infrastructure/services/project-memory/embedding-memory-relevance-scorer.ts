/**
 * EmbeddingMemoryRelevanceScorer
 *
 * Semantic implementation of IMemoryRelevanceScorer. Ranks entries by the cosine
 * similarity between the task-text embedding and each entry's embedding, then
 * blends in phase→category affinity and recency via the shared ranking helper.
 *
 * Robust by design:
 *  - When the embedding provider is unavailable (no API key / offline), it
 *    delegates entirely to the injected lexical scorer.
 *  - On an empty task text it also delegates (nothing to match semantically).
 *  - On any embedding error it falls back to lexical — selection must never fail.
 *
 * Embeddings are cached in-process by a hash of the text so the same entry isn't
 * re-embedded across the many selections in a single agent run.
 */

import { injectable, inject } from 'tsyringe';
import { createHash } from 'node:crypto';
import type { ProjectMemory } from '../../../domain/generated/output.js';
import type {
  IMemoryRelevanceScorer,
  MemoryRelevanceQuery,
  ScoredMemoryEntry,
} from '../../../application/ports/output/services/memory-relevance-scorer.interface.js';
import type { IEmbeddingProvider } from '../../../application/ports/output/services/embedding-provider.interface.js';
import { LexicalMemoryRelevanceScorer } from './lexical-memory-relevance-scorer.js';
import { rankByContentScore, clamp01 } from './relevance-ranking.js';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

@injectable()
export class EmbeddingMemoryRelevanceScorer implements IMemoryRelevanceScorer {
  private readonly cache = new Map<string, number[]>();

  constructor(
    @inject('IEmbeddingProvider') private readonly provider: IEmbeddingProvider,
    private readonly fallback: LexicalMemoryRelevanceScorer
  ) {}

  async score(query: MemoryRelevanceQuery, entries: ProjectMemory[]): Promise<ScoredMemoryEntry[]> {
    const taskText = query.taskText?.trim();
    if (entries.length === 0) return [];
    // No embeddings available or nothing to match → deterministic lexical path.
    if (!this.provider.isAvailable() || !taskText) {
      return this.fallback.score(query, entries);
    }

    try {
      const entryTexts = entries.map((e) => `${e.content} ${e.entryKey}`);
      const vectors = await this.embedCached([taskText, ...entryTexts]);
      const taskVec = vectors[0];

      const cosineById = new Map<string, number>();
      entries.forEach((entry, i) => {
        cosineById.set(entry.id, clamp01(cosineSimilarity(taskVec, vectors[i + 1])));
      });

      return rankByContentScore(query, entries, (entry) => cosineById.get(entry.id) ?? 0);
    } catch {
      // Any embedding failure → fall back; selection must never fail.
      return this.fallback.score(query, entries);
    }
  }

  /** Embed texts, serving cached vectors and only sending uncached ones. */
  private async embedCached(texts: string[]): Promise<number[][]> {
    const keys = texts.map(hashText);
    const missingIdx: number[] = [];
    keys.forEach((key, i) => {
      if (!this.cache.has(key)) missingIdx.push(i);
    });

    if (missingIdx.length > 0) {
      const fresh = await this.provider.embed(missingIdx.map((i) => texts[i]));
      missingIdx.forEach((origIdx, j) => {
        this.cache.set(keys[origIdx], fresh[j]);
      });
    }

    return keys.map((key) => this.cache.get(key) as number[]);
  }
}
