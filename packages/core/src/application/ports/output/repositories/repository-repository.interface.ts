/**
 * Repository Repository Interface (Output Port)
 *
 * Defines the contract for Repository entity persistence operations.
 */

import type { Repository } from '../../../../domain/generated/output.js';

export interface IRepositoryRepository {
  create(repository: Repository): Promise<Repository>;
  findById(id: string): Promise<Repository | null>;
  findByPath(path: string): Promise<Repository | null>;
  /** Find by path including soft-deleted records (for re-activation). */
  findByPathIncludingDeleted(path: string): Promise<Repository | null>;
  /** Find a non-deleted repository by its remote URL (normalized: lowercase, no .git suffix). */
  findByRemoteUrl(url: string): Promise<Repository | null>;
  /** Find a non-deleted repository by its upstream URL (for fork deduplication). */
  findByUpstreamUrl(url: string): Promise<Repository | null>;
  list(): Promise<Repository[]>;
  remove(id: string): Promise<void>;
  softDelete(id: string): Promise<void>;
  /** Restore a soft-deleted repository by clearing deletedAt. */
  restore(id: string): Promise<void>;
  /** Update specific fields on an existing repository. */
  update(
    id: string,
    fields: Partial<
      Pick<Repository, 'name' | 'path' | 'remoteUrl' | 'isFork' | 'upstreamUrl' | 'bedrockEnabled'>
    >
  ): Promise<Repository>;
}
