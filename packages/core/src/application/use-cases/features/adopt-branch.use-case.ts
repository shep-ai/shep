/**
 * Adopt Branch Use Case
 *
 * Imports an existing git branch into Shep's feature tracking system.
 * Creates a worktree (if needed), derives feature metadata from the branch name,
 * and persists a Feature entity. Branches with an open PR get lifecycle=Review
 * (shown as "REVIEW" in the UI); all others get lifecycle=Maintain (completed).
 *
 * This is a standalone use case — it does NOT extend or modify CreateFeatureUseCase.
 * It needs only three dependencies: IFeatureRepository, IRepositoryRepository, and IWorktreeService.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Feature, PullRequest } from '../../../domain/generated/output.js';
import { SdlcLifecycle, PrStatus, FeatureMode } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import { deriveName, deriveSlug } from './branch-name-utils.js';

export interface AdoptBranchInput {
  branchName: string;
  repositoryPath: string;
}

export interface AdoptBranchResult {
  feature: Feature;
}

/** Branches that must not be adopted as features. */
const PROTECTED_BRANCHES = new Set(['main', 'master']);

@injectable()
export class AdoptBranchUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService
  ) {}

  async execute(input: AdoptBranchInput): Promise<AdoptBranchResult> {
    const { branchName, repositoryPath } = input;

    // --- Guard: reject main/master ---
    if (PROTECTED_BRANCHES.has(branchName)) {
      throw new Error(
        `Cannot adopt the "${branchName}" branch. The main branch should not be tracked as a feature.`
      );
    }

    // --- Guard: duplicate adoption ---
    const existing = await this.featureRepo.findByBranch(branchName, repositoryPath);
    if (existing) {
      throw new Error(
        `Branch "${branchName}" is already tracked as feature "${existing.name}" (${existing.id}). ` +
          'A branch can only be adopted once per repository.'
      );
    }

    // --- Derive slug and check uniqueness ---
    const slug = deriveSlug(branchName);
    const slugCollision = await this.featureRepo.findBySlug(slug, repositoryPath);
    if (slugCollision) {
      throw new Error(
        `A feature with slug "${slug}" already exists in this repository (feature "${slugCollision.name}"). ` +
          `Cannot adopt branch "${branchName}" because its derived slug collides.`
      );
    }

    // --- Validate branch existence (local or remote) ---
    const branchRef = await this.resolveBranchRef(branchName, repositoryPath);

    // --- Resolve or create repository entity ---
    const repository = await this.resolveRepository(repositoryPath);

    // --- Create or reuse worktree ---
    const worktreePath = this.worktreeService.getWorktreePath(repositoryPath, slug);
    const worktreeExists = await this.worktreeService.exists(repositoryPath, branchName);
    if (!worktreeExists) {
      await this.worktreeService.addExisting(repositoryPath, branchRef, worktreePath);
    }

    // --- Detect open PR for this branch ---
    const prData = await this.detectPrForBranch(branchName, repositoryPath);

    // --- Derive feature metadata ---
    const name = deriveName(branchName);
    const now = new Date();

    const hasOpenPr = prData !== undefined;

    // If the branch has an open (not yet merged) PR, place the feature in
    // Review so the node shows "REVIEW" instead of "COMPLETED". Only truly
    // finished branches (no PR, merged PR, or closed PR) get Maintain.
    const lifecycle =
      prData?.status === PrStatus.Open ? SdlcLifecycle.Review : SdlcLifecycle.Maintain;

    // --- Persist feature ---
    const feature: Feature = {
      id: randomUUID(),
      name,
      slug,
      description: '',
      userQuery: '',
      repositoryPath,
      branch: branchName,
      lifecycle,
      messages: [],
      relatedArtifacts: [],
      mode: FeatureMode.Regular,
      iterationCount: 0,
      push: false,
      openPr: hasOpenPr,
      forkAndPr: false,
      commitSpecs: true,
      ciWatchEnabled: true,
      enableEvidence: false,
      injectSkills: false,
      commitEvidence: false,
      approvalGates: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
      },
      worktreePath,
      repositoryId: repository.id,
      pr: prData,
      createdAt: now,
      updatedAt: now,
    };

    await this.featureRepo.create(feature);

    return { feature };
  }

  /**
   * Resolve the git ref to use for worktree creation.
   * Returns the branch name for local branches, or "origin/<branch>" for remote-only.
   * Throws if branch does not exist anywhere.
   */
  private async resolveBranchRef(branchName: string, repositoryPath: string): Promise<string> {
    const localExists = await this.worktreeService.branchExists(repositoryPath, branchName);
    if (localExists) {
      return branchName;
    }

    const remoteExists = await this.worktreeService.remoteBranchExists(repositoryPath, branchName);
    if (remoteExists) {
      return `origin/${branchName}`;
    }

    throw new Error(
      `Branch "${branchName}" does not exist locally or on the remote. ` +
        'Check the branch name spelling and ensure you have fetched from the remote.'
    );
  }

  /**
   * Detect if the branch has an open PR (or one whose closure we cannot confirm).
   * Returns PullRequest data if found, undefined otherwise.
   * Gracefully returns undefined if gh CLI is unavailable or the repo has no remote.
   */
  private async detectPrForBranch(
    branchName: string,
    repositoryPath: string
  ): Promise<PullRequest | undefined> {
    try {
      const hasRemote = await this.gitPrService.hasRemote(repositoryPath);
      if (!hasRemote) return undefined;

      const prStatuses = await this.gitPrService.listPrStatuses(repositoryPath);
      const match = prStatuses.find((pr) => pr.headRefName === branchName);
      if (!match) return undefined;

      // If the PR is definitively closed (not merged), skip it
      if (match.state === PrStatus.Closed) return undefined;

      // Open or Merged — attach PR data
      return {
        url: match.url,
        number: match.number,
        status: match.state,
        mergeable: match.mergeable,
      };
    } catch {
      // gh CLI not installed, auth failure, etc. — gracefully skip PR detection
      return undefined;
    }
  }

  /**
   * Find or create a Repository entity for the given path.
   * Mirrors the pattern from CreateFeatureUseCase.
   */
  private async resolveRepository(repositoryPath: string) {
    const normalizedPath = repositoryPath.replace(/\\/g, '/').replace(/\/+$/, '') || repositoryPath;
    let repository = await this.repositoryRepo.findByPath(normalizedPath);

    if (!repository) {
      const now = new Date();
      const repoName = normalizedPath.split('/').pop() ?? normalizedPath;
      repository = await this.repositoryRepo.create({
        id: randomUUID(),
        name: repoName,
        path: normalizedPath,
        createdAt: now,
        updatedAt: now,
      });
      if (!repository) {
        throw new Error(
          `Failed to create or retrieve repository record for path: ${normalizedPath}`
        );
      }
    }

    return repository;
  }
}
