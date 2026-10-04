import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ListKnowledgeUseCase } from '@/application/use-cases/knowledge/list-knowledge.use-case.js';
import type { KnowledgeDocument, Space } from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockSpaceRepository,
  type MockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';
import { InMemoryKnowledgeDocuments } from '../../../../helpers/knowledge-repositories.mock.js';
import { T0 } from './knowledge.fixtures.js';

const ACME: Space = {
  ...DEFAULT_SPACE,
  id: 'space-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
};

function doc(
  id: string,
  spaceId: string,
  extra: Partial<KnowledgeDocument> = {}
): KnowledgeDocument {
  return {
    id,
    sourceId: 'src-1',
    spaceId,
    pageId: `page-${id}`,
    title: id,
    url: `https://notion.so/${id}`,
    content: 'x'.repeat(5_000),
    pageEditedAt: T0,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
}

describe('ListKnowledgeUseCase', () => {
  let documents: InMemoryKnowledgeDocuments;
  let spaces: MockSpaceRepository;
  let useCase: ListKnowledgeUseCase;

  beforeEach(async () => {
    documents = new InMemoryKnowledgeDocuments();
    spaces = createMockSpaceRepository();
    spaces.list.mockResolvedValue([DEFAULT_SPACE, ACME]);
    spaces.findBySlug.mockImplementation(async (slug: string) => (slug === 'acme' ? ACME : null));
    spaces.findById.mockImplementation(async (id: string) => (id === ACME.id ? ACME : null));
    useCase = new ListKnowledgeUseCase(documents, spaces);
    await documents.create(doc('Release process', ACME.id, { productLineId: 'pl-1' }));
    await documents.create(doc('Glossary', ACME.id));
  });

  it("lists a space's documents as summaries, without their content", async () => {
    const result = await useCase.execute('acme');
    if (!result.ok) throw new Error(result.error);
    expect(result.space.name).toBe('Acme');
    expect(result.documents).toEqual([
      {
        id: 'Glossary',
        sourceId: 'src-1',
        title: 'Glossary',
        url: 'https://notion.so/Glossary',
        pageEditedAt: T0,
      },
      {
        id: 'Release process',
        sourceId: 'src-1',
        title: 'Release process',
        url: 'https://notion.so/Release process',
        productLineId: 'pl-1',
        pageEditedAt: T0,
      },
    ]);
  });

  it('refuses an unknown space', async () => {
    expect(await useCase.execute('nope')).toEqual({ ok: false, error: 'No space "nope".' });
  });

  it('groups every space that has documents', async () => {
    const groups = await useCase.listAll();
    expect(groups).toHaveLength(1);
    expect(groups[0].space).toEqual({ id: ACME.id, name: 'Acme' });
    expect(groups[0].documents.map((d) => d.title)).toEqual(['Glossary', 'Release process']);
  });
});
