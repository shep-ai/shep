import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { LexicalMemoryRelevanceScorer } from '@/infrastructure/services/project-memory/lexical-memory-relevance-scorer.js';
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

describe('LexicalMemoryRelevanceScorer', () => {
  let scorer: LexicalMemoryRelevanceScorer;
  beforeEach(() => {
    scorer = new LexicalMemoryRelevanceScorer();
  });

  it('returns an empty array for no entries', async () => {
    expect(await scorer.score({ taskText: 'anything' }, [])).toEqual([]);
  });

  it('returns one score per entry, all in [0,1]', async () => {
    const result = await scorer.score({ taskText: 'database migration' }, [
      entry({ id: 'a', content: 'database migrations are additive' }),
      entry({ id: 'b', content: 'unrelated styling rule' }),
    ]);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('ranks entries sharing task vocabulary higher', async () => {
    const result = await scorer.score({ taskText: 'sqlite migration schema column' }, [
      entry({ id: 'match', content: 'sqlite migrations must add a column, never drop' }),
      entry({ id: 'nomatch', content: 'prefer tailwind for styling components' }),
    ]);
    expect(result[0].entry.id).toBe('match');
  });

  it('boosts on-topic categories for the consuming phase', async () => {
    // Equal (empty) task text → category affinity decides. For ci-fix, a
    // CiFixResolution entry must outrank a NamingPattern entry.
    const result = await scorer.score({ taskText: '', phase: 'ci-fix' }, [
      entry({ id: 'naming', category: MemoryCategory.NamingPattern }),
      entry({ id: 'cifix', category: MemoryCategory.CiFixResolution }),
    ]);
    expect(result[0].entry.id).toBe('cifix');
  });

  it('uses recency as a tie-breaker when lexical and category are equal', async () => {
    const result = await scorer.score({ taskText: '' }, [
      entry({ id: 'old', updatedAt: new Date('2026-01-01') }),
      entry({ id: 'new', updatedAt: new Date('2026-06-01') }),
    ]);
    expect(result[0].entry.id).toBe('new');
  });
});
