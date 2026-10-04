import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
  KNOWLEDGE_TOKEN_BUDGET,
  SelectKnowledgeUseCase,
} from '@/application/use-cases/knowledge/select-knowledge.use-case.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { InMemoryKnowledgeDocuments } from '../../../../helpers/knowledge-repositories.mock.js';
import { T0 } from './knowledge.fixtures.js';

function context(productLineId?: string) {
  return {
    execute: vi.fn(async (repositoryPath: string) => ({
      repositoryPath,
      space: { id: repositoryPath.includes('home') ? 'space-home' : 'space-acme', name: 'Acme' },
      ...(productLineId ? { productLine: { id: productLineId, name: 'Payments' } } : {}),
    })),
  } as unknown as ResolveSpaceContextUseCase;
}

async function documentsWith() {
  const documents = new InMemoryKnowledgeDocuments();
  const base = {
    sourceId: 's',
    url: 'https://notion.so/x',
    pageEditedAt: T0,
    createdAt: T0,
    updatedAt: T0,
  };
  await documents.create({
    ...base,
    id: 'refunds',
    spaceId: 'space-acme',
    pageId: '1',
    title: 'Refund policy',
    content: '# Guests\n\nGuest orders are refunded to the order email.',
  });
  await documents.create({
    ...base,
    id: 'pay',
    spaceId: 'space-acme',
    productLineId: 'line-pay',
    pageId: '2',
    title: 'Payments runbook',
    content: 'Refund retries run hourly.',
  });
  await documents.create({
    ...base,
    id: 'home',
    spaceId: 'space-home',
    pageId: '3',
    title: 'Garden refunds',
    content: 'Refund the seeds.',
  });
  return documents;
}

describe('SelectKnowledgeUseCase', () => {
  it('renders the passages most relevant to the task, naming their pages', async () => {
    const useCase = new SelectKnowledgeUseCase(await documentsWith(), context());
    const result = await useCase.execute({
      repositoryPath: '/src/pay',
      taskText: 'refund guest orders',
    });
    expect(result.passages.map((p) => p.title)).toEqual(['Refund policy']);
    expect(result.blob).toContain('### Team knowledge');
    expect(result.blob).toContain('Refund policy › Guests (https://notion.so/x)');
    expect(result.blob).toContain('Guest orders are refunded to the order email.');
  });

  it('adds the product line documents of a repository in a line, never another space', async () => {
    const useCase = new SelectKnowledgeUseCase(await documentsWith(), context('line-pay'));
    const result = await useCase.execute({ repositoryPath: '/src/pay', taskText: 'refund' });
    expect(result.passages.map((p) => p.title).sort()).toEqual([
      'Payments runbook',
      'Refund policy',
    ]);
    expect(result.blob).not.toContain('seeds');
  });

  it('keeps to the budget and is empty without a task or a match', async () => {
    const documents = new InMemoryKnowledgeDocuments();
    for (let i = 0; i < 20; i += 1) {
      await documents.create({
        id: `d${i}`,
        sourceId: 's',
        spaceId: 'space-acme',
        pageId: `${i}`,
        title: `Refunds ${i}`,
        url: 'u',
        content: `refund ${'detail '.repeat(150)}`,
        pageEditedAt: T0,
        createdAt: T0,
        updatedAt: T0,
      });
    }
    const useCase = new SelectKnowledgeUseCase(documents, context());
    const result = await useCase.execute({ repositoryPath: '/src/pay', taskText: 'refund' });
    expect(result.blob.length).toBeLessThanOrEqual(KNOWLEDGE_TOKEN_BUDGET * 4);
    expect(result.passages.length).toBeGreaterThan(0);
    expect((await useCase.execute({ repositoryPath: '/src/pay', taskText: '' })).blob).toBe('');
    expect(
      (await useCase.execute({ repositoryPath: '/src/pay', taskText: 'kubernetes' })).blob
    ).toBe('');
  });
});
