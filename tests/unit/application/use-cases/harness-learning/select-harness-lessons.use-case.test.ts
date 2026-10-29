import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
  MAX_SELECTED_LESSONS,
  SelectHarnessLessonsUseCase,
} from '@/application/use-cases/harness-learning/select-harness-lessons.use-case.js';
import { InMemoryLearnedHarnessRepository } from '../../../../helpers/harness-learning.fakes.js';
import { LessonConfidence, MemoryScope, type HarnessLesson } from '@/domain/generated/output.js';

const lesson = (id: string, cue: string): HarnessLesson => ({
  id,
  scope: MemoryScope.Project,
  repositoryPath: '/r',
  cue,
  lesson: 'do x',
  evidence: 'e',
  confidence: LessonConfidence.Low,
  sourceFeatureId: 'f',
  versionId: 'v',
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe('SelectHarnessLessonsUseCase', () => {
  it('orders lessons by the relevance scorer, passing the task text', async () => {
    const repo = new InMemoryLearnedHarnessRepository();
    await repo.createLesson(lesson('a', 'adding a migration'));
    await repo.createLesson(lesson('b', 'writing a CLI command'));
    const score = vi.fn(async (_q, entries: { id: string; content: string }[]) =>
      entries
        .map((entry) => ({ entry, score: entry.content.includes('CLI') ? 0.9 : 0.1 }))
        .sort((x, y) => y.score - x.score)
    );
    const useCase = new SelectHarnessLessonsUseCase(repo, { score } as never);
    const ids = (await useCase.execute({ repositoryPath: '/r' }, 'add a CLI command')).map(
      (l) => l.id
    );
    expect(ids).toEqual(['b', 'a']);
    expect(score.mock.calls[0][0]).toMatchObject({ taskText: 'add a CLI command' });
  });

  it('caps the selection and falls back to recency when scoring fails', async () => {
    const repo = new InMemoryLearnedHarnessRepository();
    for (let i = 0; i < MAX_SELECTED_LESSONS + 5; i++)
      await repo.createLesson(lesson(`l${i}`, 'c'));
    const useCase = new SelectHarnessLessonsUseCase(repo, {
      score: vi.fn(async () => {
        throw new Error('embeddings down');
      }),
    } as never);
    expect(await useCase.execute({ repositoryPath: '/r' }, 'x')).toHaveLength(MAX_SELECTED_LESSONS);
  });
});
