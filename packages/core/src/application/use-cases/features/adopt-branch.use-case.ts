/**
 * Adopt Branch Use Case
 *
 * Imports an existing git branch into Shep's feature tracking system.
 * Creates a worktree (if needed), derives feature metadata from the branch name,
 * and persists a Feature entity. Branches with an open PR get lifecycle=Review
 * (shown as "REVIEW" in the UI); all others get lifecycle=Maintain (completed).
 *
 * As of feature 071 (adopted-branch-agent-runs), this use case also creates an
 * AgentRun record and initializes a spec directory, enabling adopted features to
 * support agent execution (start, resume, reject) just like created features.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
// Phase 2 imports - will be used for AgentRun creation and spec directory detection
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, PullRequest } from '../../../domain/generated/output.js';
import {
  SdlcLifecycle,
  PrStatus,
  BuildMode,
  AgentRunStatus,
} from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { ISpecInitializerService } from '../../ports/output/services/spec-initializer.interface.js';
import type { ISettingsProvider } from '../../ports/output/services/settings-provider.interface.js';
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
    private readonly gitPrService: IGitPrService,
    @inject('IAgentRunRepository')
    private readonly agentRunRepo: IAgentRunRepository,
    @inject('ISpecInitializerService')
    private readonly specInitializer: ISpecInitializerService,
    @inject('ISettingsProvider')
    private readonly settingsProvider: ISettingsProvider
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

    // --- Calculate feature number for spec directory ---
    // Use existing feature count as hint; SpecInitializerService.resolveNextNumber()
    // will scan filesystem to determine actual next available number
    const effectiveRepoPath = repository.path;
    const existingFeatures = await this.featureRepo.list({
      repositoryPath: effectiveRepoPath,
    });
    const featureNumber = existingFeatures.length;

    // --- Create or reuse worktree ---
    const worktreePath = this.worktreeService.getWorktreePath(repositoryPath, slug);
    const worktreeExists = await this.worktreeService.exists(repositoryPath, branchName);
    if (!worktreeExists) {
      await this.worktreeService.addExisting(repositoryPath, branchRef, worktreePath);
    }

    // --- Initialize or detect spec directory ---
    // Check if spec directory already exists (e.g., from previous /shep-kit:new-feature work)
    // If exists, preserve it. If not, initialize with empty YAMLs.
    const nnn = String(featureNumber).padStart(3, '0');
    const expectedSpecDir = join(worktreePath, 'specs', `${nnn}-${slug}`);

    let specDir: string;
    if (existsSync(expectedSpecDir)) {
      // Spec directory already exists — use it without modification
      specDir = expectedSpecDir;
    } else {
      // No spec directory — initialize with empty YAMLs
      const result = await this.specInitializer.initialize(
        worktreePath,
        slug,
        featureNumber,
        '(adopted from existing branch)'
      );
      specDir = result.specDir;
    }

    // --- Create AgentRun record (following CreateFeatureUseCase pattern lines 156-210) ---
    const runId = randomUUID();
    const settings = this.settingsProvider.get();
    const now = new Date();

    const agentRun = {
      id: runId,
      agentType: settings.agent.type,
      agentName: 'feature-agent',
      status: AgentRunStatus.pending,
      prompt: '(adopted from existing branch)',
      threadId: randomUUID(), // New UUID for LangGraph checkpoint isolation
      featureId: '', // Will be set after Feature creation, but we need runId first
      repositoryPath: effectiveRepoPath,
      ...(settings.models?.default ? { modelId: settings.models.default } : {}),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // --- Detect open PR for this branch ---
    const prData = await this.detectPrForBranch(branchName, repositoryPath);

    // --- Derive feature metadata ---
    const name = deriveName(branchName);

    const hasOpenPr = prData !== undefined;

    // If the branch has an open (not yet merged) PR, place the feature in
    // Review so the node shows "REVIEW" instead of "COMPLETED". Only truly
    // finished branches (no PR, merged PR, or closed PR) get Maintain.
    const lifecycle =
      prData?.status === PrStatus.Open ? SdlcLifecycle.Review : SdlcLifecycle.Maintain;

    // --- Construct Feature entity ---
    const featureId = randomUUID();
    const feature: Feature = {
      id: featureId,
      name,
      slug,
      description: '',
      userQuery: '',
      repositoryPath,
      branch: branchName,
      lifecycle,
      messages: [],
      relatedArtifacts: [],
      buildMode: BuildMode.Application,
      fast: false,
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
      specPath: specDir,
      agentRunId: runId,
      repositoryId: repository.id,
      iterationCount: 0,
      pr: prData,
      bedrockEnabled: false,
      createdAt: now,
      updatedAt: now,
    };

    // --- Persist AgentRun before Feature (respects referential integrity) ---
    // Set featureId now that we have it
    agentRun.featureId = featureId;
    await this.agentRunRepo.create(agentRun);

    // --- Persist Feature (after AgentRun exists) ---
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
        bedrockEnabled: false,
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
