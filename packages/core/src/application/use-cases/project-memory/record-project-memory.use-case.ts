/**
 * RecordProjectMemoryUseCase
 *
 * Upserts a batch of extracted memory entries for a repository. Used by the
 * post-merge extraction node to persist conventions, library choices, naming
 * patterns, architecture decisions, and CI-fix resolutions distilled from a
 * just-merged feature. Idempotent per (repositoryPath, category, entryKey):
 * re-recording the same key updates the entry in place.
 *
 * Normalises input defensively: blank entries are skipped, content is trimmed
 * and length-capped, so untrusted agent output cannot bloat the store.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { MemoryCategory } from '../../../domain/generated/output.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import { MAX_CONTENT_LENGTH } from './project-memory.constants.js';

export interface ProjectMemoryEntryInput {
  category: MemoryCategory;
  entryKey: string;
  content: string;
}

export interface RecordProjectMemoryInput {
  /** Normalised repository path the entries belong to. */
  repositoryPath: string;
  /** Optional ID of the feature whose merge produced these entries. */
  sourceFeatureId?: string;
  /** Entries to upsert. */
  entries: ProjectMemoryEntryInput[];
}

export interface RecordProjectMemoryResult {
  /** Number of entries actually upserted (after skipping blanks). */
  recorded: number;
}

@injectable()
export class RecordProjectMemoryUseCase {
  constructor(
    @inject('IProjectMemoryRepository')
    private readonly memoryRepo: IProjectMemoryRepository
  ) {}

  async execute(input: RecordProjectMemoryInput): Promise<RecordProjectMemoryResult> {
    const repositoryPath = input.repositoryPath?.trim();
    if (!repositoryPath) {
      return { recorded: 0 };
    }

    let recorded = 0;
    for (const entry of input.entries ?? []) {
      const entryKey = entry.entryKey?.trim();
      const content = entry.content?.trim();
      if (!entryKey || !content) continue;

      await this.memoryRepo.upsert({
        id: randomUUID(),
        repositoryPath,
        category: entry.category,
        entryKey,
        content: content.slice(0, MAX_CONTENT_LENGTH),
        sourceFeatureId: input.sourceFeatureId,
      });
      recorded += 1;
    }

    return { recorded };
  }
}
