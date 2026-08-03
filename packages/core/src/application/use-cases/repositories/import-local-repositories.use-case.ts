/**
 * Import Local Repositories Use Case
 *
 * Bulk-imports a set of local directories as tracked repositories.
 *
 * Business Rules:
 * - Every path is delegated to AddRepositoryUseCase, which owns path
 *   normalization, dedupe against existing rows, and soft-delete restore. This
 *   use case adds batching and reporting only — it must not reimplement any of
 *   that logic.
 * - A failing path never aborts the batch. Each path gets its own result entry
 *   so partial failures are visible to the caller instead of silently dropped.
 * - Duplicate paths within one request collapse to a single import.
 */

import { injectable, inject } from 'tsyringe';
import type { Repository } from '../../../domain/generated/output.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import { isAbsolutePath } from '../../../domain/shared/absolute-path.js';
import { AddRepositoryUseCase } from './add-repository.use-case.js';

export interface ImportLocalRepositoriesInput {
  /** Absolute paths selected for import */
  paths: string[];
}

export interface ImportLocalRepositoryResult {
  /** The normalized path this entry refers to */
  path: string;
  /** Whether the import succeeded */
  imported: boolean;
  /** The tracked repository, present when imported is true */
  repository?: Repository;
  /** Failure reason, present when imported is false */
  error?: string;
}

export interface ImportLocalRepositoriesResult {
  results: ImportLocalRepositoryResult[];
  importedCount: number;
  failedCount: number;
}

@injectable()
export class ImportLocalRepositoriesUseCase {
  constructor(
    @inject(AddRepositoryUseCase)
    private readonly addRepository: AddRepositoryUseCase
  ) {}

  async execute(input: ImportLocalRepositoriesInput): Promise<ImportLocalRepositoriesResult> {
    const uniquePaths = this.dedupe(input.paths);

    const results: ImportLocalRepositoryResult[] = [];
    for (const path of uniquePaths) {
      results.push(await this.importOne(path));
    }

    return {
      results,
      importedCount: results.filter((r) => r.imported).length,
      failedCount: results.filter((r) => !r.imported).length,
    };
  }

  /** Normalize first so trailing-slash variants of one path import once. */
  private dedupe(paths: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const raw of paths) {
      const path = normalizePath(raw);
      if (path === '' || seen.has(path)) continue;
      seen.add(path);
      unique.push(path);
    }

    return unique;
  }

  private async importOne(path: string): Promise<ImportLocalRepositoryResult> {
    if (!isAbsolutePath(path)) {
      return {
        path,
        imported: false,
        error: `Path must be absolute, received "${path}"`,
      };
    }

    try {
      const repository = await this.addRepository.execute({ path });
      return { path, imported: true, repository };
    } catch (error) {
      return {
        path,
        imported: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
