/**
 * Import GitHub Repository Use Case
 *
 * Orchestrates importing a GitHub repository: validates the URL, checks auth,
 * detects duplicates by remoteUrl/upstreamUrl, checks push access, and either
 * clones directly or auto-forks when the user lacks push access.
 */

import { injectable, inject } from 'tsyringe';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Repository } from '../../../domain/generated/output.js';
import type {
  IGitHubRepositoryService,
  CloneOptions,
  ForkOptions,
} from '../../ports/output/services/github-repository-service.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import { AddRepositoryUseCase } from './add-repository.use-case.js';

/** Name of the git remote used to track the original upstream repo of a fork. */
const UPSTREAM_REMOTE_NAME = 'upstream';

export interface ImportGitHubRepositoryInput {
  /** GitHub URL or shorthand (e.g. "owner/repo") */
  url: string;
  /** Override clone destination directory */
  dest?: string;
  /** Default base directory for clones (from settings) */
  defaultCloneDir?: string;
  /** Options for the clone subprocess (e.g. progress callback) */
  cloneOptions?: CloneOptions;
  /** Options for fork operations (e.g. progress callback) */
  forkOptions?: ForkOptions;
}

/**
 * Normalizes a GitHub remote URL for storage and duplicate detection.
 * Lowercases and strips trailing .git suffix.
 */
function normalizeRemoteUrl(nameWithOwner: string): string {
  return `https://github.com/${nameWithOwner.toLowerCase()}`;
}

@injectable()
export class ImportGitHubRepositoryUseCase {
  constructor(
    @inject('IGitHubRepositoryService')
    private readonly gitHubService: IGitHubRepositoryService,
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository,
    @inject(AddRepositoryUseCase)
    private readonly addRepositoryUseCase: AddRepositoryUseCase,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService
  ) {}

  async execute(input: ImportGitHubRepositoryInput): Promise<Repository> {
    // 1. Validate URL — throws GitHubUrlParseError for invalid formats
    const parsed = this.gitHubService.parseGitHubUrl(input.url);

    // 2. Normalize the remote URL for storage and duplicate detection
    const normalizedUrl = normalizeRemoteUrl(parsed.nameWithOwner);

    // 3. Check for duplicate by remoteUrl — skip clone if already tracked
    const existing = await this.repositoryRepo.findByRemoteUrl(normalizedUrl);
    if (existing) {
      return existing;
    }

    // 3b. Check for duplicate by upstreamUrl (fork of this repo already imported)
    const existingFork = await this.repositoryRepo.findByUpstreamUrl(normalizedUrl);
    if (existingFork) {
      return existingFork;
    }

    // 4. Check auth — throws GitHubAuthError if not authenticated
    await this.gitHubService.checkAuth();

    // 5. Check push access to determine if we need to fork
    const { hasPushAccess } = await this.gitHubService.checkPushAccess(parsed.nameWithOwner);

    if (hasPushAccess) {
      return this.cloneDirect(input, parsed.nameWithOwner, parsed.repo, normalizedUrl);
    }

    return this.forkAndClone(input, parsed.nameWithOwner, parsed.repo, normalizedUrl);
  }

  /**
   * Direct clone path — user has push access to the repository.
   */
  private async cloneDirect(
    input: ImportGitHubRepositoryInput,
    nameWithOwner: string,
    repoName: string,
    normalizedUrl: string
  ): Promise<Repository> {
    const destination = this.resolveDestination(input, repoName);

    await this.gitHubService.cloneRepository(nameWithOwner, destination, input.cloneOptions);

    const repository = await this.addRepositoryUseCase.execute({
      path: destination,
      name: repoName,
    });

    await this.repositoryRepo.update(repository.id, {
      remoteUrl: normalizedUrl,
    });

    return { ...repository, remoteUrl: normalizedUrl };
  }

  /**
   * Fork-and-clone path — user lacks push access, so we auto-fork first.
   */
  private async forkAndClone(
    input: ImportGitHubRepositoryInput,
    originalNameWithOwner: string,
    repoName: string,
    normalizedOriginalUrl: string
  ): Promise<Repository> {
    // Fork the repository
    const forkResult = await this.gitHubService.forkRepository(
      originalNameWithOwner,
      input.forkOptions
    );

    // Check if fork was already tracked
    const normalizedForkUrl = normalizeRemoteUrl(forkResult.nameWithOwner);
    const existingForkByRemote = await this.repositoryRepo.findByRemoteUrl(normalizedForkUrl);
    if (existingForkByRemote) {
      return existingForkByRemote;
    }

    // Clone the fork
    const destination = this.resolveDestination(input, repoName);
    await this.gitHubService.cloneRepository(
      forkResult.nameWithOwner,
      destination,
      input.cloneOptions
    );

    // Configure the upstream remote so users can `git fetch upstream` / sync
    // with the original repo. Without this, the fork has no knowledge of its
    // upstream — breaking PR workflows that rely on upstream as the merge base.
    await this.gitPrService.addRemote(destination, UPSTREAM_REMOTE_NAME, normalizedOriginalUrl);

    // Register the cloned fork
    const repository = await this.addRepositoryUseCase.execute({
      path: destination,
      name: repoName,
    });

    // Update with fork metadata
    await this.repositoryRepo.update(repository.id, {
      remoteUrl: normalizedForkUrl,
      isFork: true,
      upstreamUrl: normalizedOriginalUrl,
    });

    return {
      ...repository,
      remoteUrl: normalizedForkUrl,
      isFork: true,
      upstreamUrl: normalizedOriginalUrl,
    };
  }

  private resolveDestination(input: ImportGitHubRepositoryInput, repoName: string): string {
    if (input.dest) {
      return normalizePath(input.dest);
    }

    let baseDir = input.defaultCloneDir ?? join(homedir(), 'repos');
    if (baseDir.startsWith('~/')) {
      baseDir = join(homedir(), baseDir.slice(2));
    }
    return normalizePath(join(baseDir, repoName));
  }
}

/**
 * Normalizes a filesystem path to use forward slashes.
 *
 * Per packages/CLAUDE.md, all paths stored in the database MUST use forward
 * slashes so that Windows and POSIX callers resolve/compare identically.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
