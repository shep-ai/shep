import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingMemoryRelevanceScorer } from '@/infrastructure/services/project-memory/embedding-memory-relevance-scorer.js';
import { LexicalMemoryRelevanceScorer } from '@/infrastructure/services/project-memory/lexical-memory-relevance-scorer.js';
import type { IEmbeddingProvider } from '@/application/ports/output/services/embedding-provider.interface.js';
import type { ProjectMemory } from '@/domain/generated/output.js';
import { MemoryCategory } from '@/domain/generated/output.js';

function entry(over: Partial<ProjectMemory>): ProjectMemory {
  return {
    id: 'id',
    repositoryPath: '/repo',
    category: MemoryCategory.Convention,
    entryKey: 'k',
    content: 'content',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

describe('EmbeddingMemoryRelevanceScorer', () => {
  let provider: IEmbeddingProvider;
  let lexical: LexicalMemoryRelevanceScorer;

  beforeEach(() => {
    lexical = new LexicalMemoryRelevanceScorer();
  });

  it('falls back to the lexical scorer when the provider is unavailable', async () => {
    provider = { isAvailable: () => false, embed: vi.fn() };
    const scorer = new EmbeddingMemoryRelevanceScorer(provider, lexical);

    const entries = [
      entry({ id: 'match', content: 'database migration schema' }),
      entry({ id: 'other', content: 'tailwind styling' }),
    ];
    const result = await scorer.score({ taskText: 'database migration' }, entries);

    expect(provider.embed).not.toHaveBeenCalled();
    expect(result[0].entry.id).toBe('match'); // same as lexical
  });

  it('falls back to lexical when the task text is empty', async () => {
    provider = { isAvailable: () => true, embed: vi.fn() };
    const scorer = new EmbeddingMemoryRelevanceScorer(provider, lexical);

    await scorer.score({ taskText: '   ' }, [entry({ id: 'a' })]);
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('ranks by cosine similarity to the task embedding when available', async () => {
    // Task vector [1,0]. "near" entry vector aligns; "far" is orthogonal.
    const embed = vi.fn(async (texts: string[]) =>
      texts.map((t) => {
        if (t.includes('TASK')) return [1, 0];
        if (t.includes('NEAR')) return [0.9, 0.1];
        return [0, 1]; // FAR
      })
    );
    provider = { isAvailable: () => true, embed };
    const scorer = new EmbeddingMemoryRelevanceScorer(provider, lexical);

    const result = await scorer.score({ taskText: 'TASK' }, [
      entry({ id: 'far', content: 'FAR' }),
      entry({ id: 'near', content: 'NEAR' }),
    ]);

    expect(result[0].entry.id).toBe('near');
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('falls back to lexical when embedding throws', async () => {
    provider = {
      isAvailable: () => true,
      embed: vi.fn().mockRejectedValue(new Error('network down')),
    };
    const scorer = new EmbeddingMemoryRelevanceScorer(provider, lexical);

    const result = await scorer.score({ taskText: 'migration' }, [
      entry({ id: 'a', content: 'migration helper' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].entry.id).toBe('a');
  });

  it('caches embeddings so repeated entries are not re-embedded', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    provider = { isAvailable: () => true, embed };
    const scorer = new EmbeddingMemoryRelevanceScorer(provider, lexical);

    const entries = [entry({ id: 'a', content: 'same', entryKey: 'same' })];
    await scorer.score({ taskText: 'TASK' }, entries);
    await scorer.score({ taskText: 'TASK' }, entries);

    // Second call serves both task + entry from cache → no new texts embedded.
    expect(embed).toHaveBeenCalledTimes(1);
  });
});
