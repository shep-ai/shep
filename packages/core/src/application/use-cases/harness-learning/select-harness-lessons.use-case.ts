/**
 * SelectHarnessLessonsUseCase (spec 150)
 *
 * The lessons an improver reads first: every lesson reaching the scope,
 * ranked by the same IMemoryRelevanceScorer that ranks Shep Brain memory
 * (lexical by default, semantic when embeddings are configured), most
 * relevant first, capped. Lessons guide REFINEMENT; they never reach a
 * solver prompt.
 */

import { inject, injectable } from 'tsyringe';
import {
  MemoryCategory,
  type HarnessLesson,
  type ProjectMemory,
} from '../../../domain/generated/output.js';
import type {
  HarnessScopeKey,
  ILearnedHarnessRepository,
} from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { IMemoryRelevanceScorer } from '../../ports/output/services/memory-relevance-scorer.interface.js';

export const MAX_SELECTED_LESSONS = 20;
const LESSON_PHASE = 'harness-learning';

function asScorable(lesson: HarnessLesson): ProjectMemory {
  return {
    id: lesson.id,
    repositoryPath: lesson.repositoryPath,
    category: MemoryCategory.Convention,
    entryKey: lesson.id,
    content: `${lesson.cue} — ${lesson.lesson}`,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

@injectable()
export class SelectHarnessLessonsUseCase {
  constructor(
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject('IMemoryRelevanceScorer') private readonly scorer: IMemoryRelevanceScorer
  ) {}

  async execute(scope: HarnessScopeKey, taskText: string): Promise<HarnessLesson[]> {
    const lessons = await this.harnesses.listLessons(scope);
    if (lessons.length <= 1) return lessons;
    const byId = new Map(lessons.map((l) => [l.id, l]));
    try {
      const ranked = await this.scorer.score(
        { taskText, phase: LESSON_PHASE },
        lessons.map(asScorable)
      );
      return ranked
        .map((r) => byId.get(r.entry.id))
        .filter((l): l is HarnessLesson => l !== undefined)
        .slice(0, MAX_SELECTED_LESSONS);
    } catch {
      return lessons.slice(0, MAX_SELECTED_LESSONS);
    }
  }
}
