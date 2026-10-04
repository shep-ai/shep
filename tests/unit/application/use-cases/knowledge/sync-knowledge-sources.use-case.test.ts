import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SyncKnowledgeSourcesUseCase } from '@/application/use-cases/knowledge/sync-knowledge-sources.use-case.js';
import type { SyncKnowledgeSourceUseCase } from '@/application/use-cases/knowledge/sync-knowledge-source.use-case.js';
import { InMemoryKnowledgeSources } from '../../../../helpers/knowledge-repositories.mock.js';
import { SOURCE, at } from './knowledge.fixtures.js';

describe('SyncKnowledgeSourcesUseCase', () => {
  it('runs due enabled sources, or every enabled one on request', async () => {
    const sources = new InMemoryKnowledgeSources();
    await sources.create({ ...SOURCE, id: 'due', lastRunAt: at(-120) });
    await sources.create({ ...SOURCE, id: 'recent', lastRunAt: at(-10) });
    await sources.create({ ...SOURCE, id: 'off', enabled: false });
    const one = { execute: vi.fn(async (id: string) => ({ ok: true, source: { id } })) };
    const useCase = new SyncKnowledgeSourcesUseCase(
      sources,
      one as unknown as SyncKnowledgeSourceUseCase
    );

    await useCase.runDue(at(0));
    expect(one.execute.mock.calls.map((c) => c[0])).toEqual(['due']);

    one.execute.mockClear();
    expect((await useCase.runAll()).length).toBe(2);
    expect(one.execute.mock.calls.map((c) => c[0])).toEqual(['due', 'recent']);
  });
});
