/**
 * ReadProjectMemoryUseCase
 *
 * Loads the persisted project memory for a repository and renders it as a
 * compact, category-sectioned blob ready for injection into the early agent
 * prompts (analyze / research). Returns an empty blob for repositories with no
 * memory yet, so callers can omit the memory section entirely.
 *
 * Presentation-agnostic: returns a plain string the CLI, TUI, or web can use.
 */

import { injectable, inject } from 'tsyringe';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import { renderMemoryBlob } from './render-memory-blob.js';
import { loadCandidateMemory } from './load-candidate-memory.js';

export interface ReadProjectMemoryInput {
  /** Normalised repository path whose memory should be loaded. */
  repositoryPath: string;
}

export interface ReadProjectMemoryResult {
  /** Category-sectioned Markdown blob; empty string when no memory exists. */
  blob: string;
  /** Number of entries that backed the blob (post-render, pre-cap count). */
  entryCount: number;
}

@injectable()
export class ReadProjectMemoryUseCase {
  constructor(
    @inject('IProjectMemoryRepository')
    private readonly memoryRepo: IProjectMemoryRepository
  ) {}

  async execute(input: ReadProjectMemoryInput): Promise<ReadProjectMemoryResult> {
    const repositoryPath = input.repositoryPath?.trim();
    if (!repositoryPath) {
      return { blob: '', entryCount: 0 };
    }

    // The agent sees this project's own memory PLUS every organization-wide
    // entry (authored once, reused across all related projects).
    const entries = await loadCandidateMemory(this.memoryRepo, repositoryPath);
    return { blob: renderMemoryBlob(entries), entryCount: entries.length };
  }
}
