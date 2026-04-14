/**
 * Add Repository Use Case
 *
 * Creates a new Repository entity from a filesystem path.
 * Normalizes the path and returns existing repository if path already tracked.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Repository } from '../../../domain/generated/output.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';

export interface AddRepositoryInput {
  path: string;
  name?: string;
}

@injectable()
export class AddRepositoryUseCase {
  constructor(
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository
  ) {}

  async execute(input: AddRepositoryInput): Promise<Repository> {
    const normalizedPath = normalizePath(input.path);

    // Check for existing active repository with same path
    const existing = await this.repositoryRepo.findByPath(normalizedPath);
    if (existing) {
      return existing;
    }

    // Check for soft-deleted repository — restore it instead of creating a duplicate.
    // Reset createdAt so the restored repo sorts as "newest" on the canvas
    // (otherwise the old createdAt would place it above repos added later).
    const deleted = await this.repositoryRepo.findByPathIncludingDeleted(normalizedPath);
    if (deleted) {
      const now = new Date();
      await this.repositoryRepo.restore(deleted.id);
      return { ...deleted, deletedAt: undefined, createdAt: now, updatedAt: now };
    }

    const now = new Date();
    const name = input.name ?? normalizedPath.split('/').pop() ?? normalizedPath;

    const repository: Repository = {
      id: randomUUID(),
      name,
      path: normalizedPath,
      createdAt: now,
      updatedAt: now,
    };

    await this.repositoryRepo.create(repository);
    return repository;
  }
}
