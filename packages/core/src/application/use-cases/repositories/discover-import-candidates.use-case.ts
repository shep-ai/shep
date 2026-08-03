/**
 * Discover Import Candidates Use Case
 *
 * Lists the immediate subfolders of a directory as bulk-import candidates,
 * annotating each with whether it is a git repository and whether shep already
 * tracks it.
 *
 * Business Rules:
 * - Nothing is filtered out. The resolved product decision (spec 105) is that
 *   the user picks from a complete list; shep only annotates. A non-git folder
 *   is still offered, just flagged.
 * - Enumeration is not recursive.
 * - Candidate paths are normalized with the same helper AddRepositoryUseCase
 *   uses, so an "already tracked" annotation can never disagree with what the
 *   subsequent import actually does.
 */

import { injectable, inject } from 'tsyringe';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import type { IRepositoryDiscoveryService } from '../../ports/output/services/repository-discovery-service.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';

export interface DiscoverImportCandidatesInput {
  /** Absolute path of the parent directory to enumerate */
  directoryPath: string;
}

export interface ImportCandidate {
  /** Directory name as shown to the user */
  name: string;
  /** Normalized absolute path */
  path: string;
  /** Whether the directory contains a .git entry */
  isGitRepository: boolean;
  /** Whether shep already tracks an active repository at this path */
  alreadyTracked: boolean;
  /**
   * Whether a soft-deleted repository exists at this path. Importing restores
   * it rather than creating a duplicate, so the UI can say so.
   */
  previouslyRemoved: boolean;
}

export interface DiscoverImportCandidatesResult {
  /** The normalized directory that was scanned */
  directoryPath: string;
  candidates: ImportCandidate[];
}

@injectable()
export class DiscoverImportCandidatesUseCase {
  constructor(
    @inject('IRepositoryDiscoveryService')
    private readonly discovery: IRepositoryDiscoveryService,
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository
  ) {}

  async execute(input: DiscoverImportCandidatesInput): Promise<DiscoverImportCandidatesResult> {
    const directoryPath = normalizePath(input.directoryPath);

    if (!directoryPath.startsWith('/')) {
      throw new Error(
        `Directory path must be absolute, received "${input.directoryPath}". ` +
          'Resolve the path before calling this use case.'
      );
    }

    const discovered = await this.discovery.listSubdirectories(directoryPath);

    const candidates = await Promise.all(
      discovered.map(async (entry) => this.annotate(entry.name, entry.path, entry.isGitRepository))
    );

    return { directoryPath, candidates };
  }

  private async annotate(
    name: string,
    rawPath: string,
    isGitRepository: boolean
  ): Promise<ImportCandidate> {
    const path = normalizePath(rawPath);

    const existing = await this.repositoryRepo.findByPath(path);
    if (existing) {
      return { name, path, isGitRepository, alreadyTracked: true, previouslyRemoved: false };
    }

    const removed = await this.repositoryRepo.findByPathIncludingDeleted(path);
    return {
      name,
      path,
      isGitRepository,
      alreadyTracked: false,
      previouslyRemoved: removed !== null,
    };
  }
}
