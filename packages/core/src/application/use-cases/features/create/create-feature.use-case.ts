/**
 * Create Feature Use Case
 *
 * Creates a new feature entity with a git worktree for isolated development,
 * initializes the spec directory with YAML templates, then spawns the
 * feature agent to begin autonomous SDLC processing.
 *
 * Business Rules:
 * - Metadata generation delegated to MetadataGenerator service
 * - Slug uniqueness delegated to SlugResolver service
 * - Full user input is preserved as-is in spec.yaml
 * - A git worktree is created at ~/.shep/repos/HASH/wt/SLUG/
 * - Spec YAML files are scaffolded at WORKTREE/specs/NNN-SLUG/
 * - Feature agent is spawned with the spec dir path
 * - specPath is persisted on the Feature record
 * - Initial lifecycle is Requirements
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Feature } from '../../../../domain/generated/output.js';
import {
  SdlcLifecycle,
  AgentRunStatus,
  FeatureMode,
  type AgentType,
} from '../../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { IWorktreeService } from '../../../ports/output/services/worktree-service.interface.js';
import type { IFeatureAgentProcessService } from '../../../ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '../../../ports/output/agents/agent-run-repository.interface.js';
import type { ISpecInitializerService } from '../../../ports/output/services/spec-initializer.interface.js';
import type { IRepositoryRepository } from '../../../ports/output/repositories/repository-repository.interface.js';
import type { IGitPrService } from '../../../ports/output/services/git-pr-service.interface.js';
import type { IAgentValidator } from '../../../ports/output/agents/agent-validator.interface.js';
import type { ISkillInjectorService } from '../../../ports/output/services/skill-injector.interface.js';
import { getSettings } from '../../../../infrastructure/services/settings.service.js';
import { createDefaultSettings } from '../../../../domain/factories/settings-defaults.factory.js';
import { POST_IMPLEMENTATION } from '../../../../domain/lifecycle-gates.js';
import { AttachmentStorageService } from '../../../../infrastructure/services/attachment-storage.service.js';
import { MetadataGenerator } from './metadata-generator.js';
import { SlugResolver } from './slug-resolver.js';
import type { CreateFeatureInput, CreateFeatureResult, CreateRecordResult } from './types.js';

@injectable()
export class CreateFeatureUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService,
    @inject('IFeatureAgentProcessService')
    private readonly agentProcess: IFeatureAgentProcessService,
    @inject('IAgentRunRepository')
    private readonly runRepository: IAgentRunRepository,
    @inject('ISpecInitializerService')
    private readonly specInitializer: ISpecInitializerService,
    @inject(MetadataGenerator)
    private readonly metadataGenerator: MetadataGenerator,
    @inject(SlugResolver)
    private readonly slugResolver: SlugResolver,
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject(AttachmentStorageService)
    private readonly attachmentStorage: AttachmentStorageService,
    @inject('IAgentValidator')
    private readonly agentValidator: IAgentValidator,
    @inject('ISkillInjectorService')
    private readonly skillInjector: ISkillInjectorService
  ) {}

  /**
   * Full synchronous execution: creates record, initializes worktree/spec, spawns agent.
   * Used by the CLI which shows a spinner and needs everything done before returning.
   */
  async execute(input: CreateFeatureInput): Promise<CreateFeatureResult> {
    const { feature, shouldSpawn } = await this.createRecord(input);
    const { warning, updatedFeature } = await this.initializeAndSpawn(feature, input, shouldSpawn);
    return { feature: updatedFeature, warning };
  }

  /**
   * Phase 1 (fast): Creates the feature + agent run records in DB and returns immediately.
   * The feature has a real UUID and a preliminary slug derived from the provided name.
   * No AI calls, no git operations — just DB writes.
   */
  async createRecord(input: CreateFeatureInput): Promise<CreateRecordResult> {
    const effectiveMode = input.mode ?? FeatureMode.Regular;
    let initialLifecycle: SdlcLifecycle =
      effectiveMode === FeatureMode.Exploration
        ? SdlcLifecycle.Exploring
        : effectiveMode === FeatureMode.Fast
          ? SdlcLifecycle.Implementation
          : SdlcLifecycle.Requirements;
    let shouldSpawn = true;
    let effectiveRepoPath = input.repositoryPath.replace(/\\/g, '/');

    // Pending flag takes precedence — user explicitly defers agent execution.
    // Parent gate validation is deferred to StartFeatureUseCase.
    if (input.pending) {
      initialLifecycle = SdlcLifecycle.Pending;
      shouldSpawn = false;
    }

    if (input.parentId) {
      const parent = await this.featureRepo.findById(input.parentId);
      if (!parent) {
        throw new Error(`Parent feature not found: ${input.parentId}`);
      }

      effectiveRepoPath = parent.repositoryPath;

      // Cycle detection — O(depth) upward walk through ancestor chain
      const visited = new Set<string>([input.parentId]);
      let cursor = parent.parentId;
      while (cursor) {
        if (visited.has(cursor)) {
          throw new Error(`Cycle detected in feature dependency chain at feature: ${cursor}`);
        }
        visited.add(cursor);
        const ancestor = await this.featureRepo.findById(cursor);
        cursor = ancestor?.parentId ?? undefined;
      }

      // Skip gate logic when pending — parent gate is deferred to start time
      if (!input.pending) {
        if (
          parent.lifecycle === SdlcLifecycle.Blocked ||
          !POST_IMPLEMENTATION.has(parent.lifecycle)
        ) {
          initialLifecycle = SdlcLifecycle.Blocked;
          shouldSpawn = false;
        } else {
          initialLifecycle = SdlcLifecycle.Started;
          shouldSpawn = true;
        }
      }
    }

    // Resolve or create repository entity for this path
    const normalizedPath =
      effectiveRepoPath.replace(/\\/g, '/').replace(/\/+$/, '') || effectiveRepoPath;
    let repository = await this.repositoryRepo.findByPath(normalizedPath);
    const now = new Date();
    if (!repository) {
      const repoName = normalizedPath.split('/').pop() ?? normalizedPath;
      repository = {
        id: randomUUID(),
        name: repoName,
        path: normalizedPath,
        createdAt: now,
        updatedAt: now,
      };
      repository = await this.repositoryRepo.create(repository);
      if (!repository) {
        throw new Error(
          `Failed to create or retrieve repository record for path: ${normalizedPath}`
        );
      }
    }

    const featureName = input.name ?? input.userInput.slice(0, 100);
    const runId = randomUUID();
    const featureId = randomUUID();

    // Use the feature ID as a temporary slug so it never collides with the
    // AI-generated slug in initializeAndSpawn() → resolveUniqueSlug().
    const feature: Feature = {
      id: featureId,
      name: featureName,
      slug: featureId,
      description: input.description ?? '',
      userQuery: input.userInput,
      repositoryPath: effectiveRepoPath,
      branch: '',
      lifecycle: initialLifecycle,
      messages: [],
      relatedArtifacts: [],
      mode: effectiveMode,
      push: input.push ?? false,
      openPr: input.openPr ?? false,
      forkAndPr: input.forkAndPr ?? false,
      commitSpecs: input.commitSpecs ?? true,
      ciWatchEnabled: input.ciWatchEnabled ?? true,
      enableEvidence: input.enableEvidence ?? false,
      injectSkills: input.injectSkills ?? false,
      commitEvidence: input.commitEvidence ?? false,
      approvalGates: input.approvalGates ?? {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
      },
      iterationCount: 0,
      ...(effectiveMode === FeatureMode.Exploration && {
        maxIterations: getSettings().workflow.explorationMaxIterations ?? 10,
      }),
      agentRunId: runId,
      specPath: '',
      repositoryId: repository.id,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await this.featureRepo.create(feature);

    // Create agent run record (pending state — agent not spawned yet)
    const settings = getSettings();
    const agentRun = {
      id: runId,
      agentType: (input.agentType as typeof settings.agent.type) ?? settings.agent.type,
      agentName: 'feature-agent',
      status: AgentRunStatus.pending,
      prompt: input.userInput,
      threadId: randomUUID(),
      featureId: feature.id,
      repositoryPath: effectiveRepoPath,
      ...(input.approvalGates ? { approvalGates: input.approvalGates } : {}),
      ...(input.model
        ? { modelId: input.model }
        : settings.models?.default
          ? { modelId: settings.models.default }
          : {}),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.runRepository.create(agentRun);

    return { feature, shouldSpawn };
  }

  /**
   * Phase 2 (slow): AI metadata generation, git worktree, spec init, agent spawn.
   * Updates the feature record with refined metadata, branch, and specPath.
   */
  async initializeAndSpawn(
    feature: Feature,
    input: CreateFeatureInput,
    shouldSpawn: boolean
  ): Promise<{ warning?: string; updatedFeature: Feature }> {
    const effectiveRepoPath = feature.repositoryPath;

    // Ensure the target directory is a git repository (auto-init if needed)
    await this.worktreeService.ensureGitRepository(effectiveRepoPath);

    const metadata = await this.metadataGenerator.generateMetadata(
      input.userInput,
      input.agentType as AgentType | undefined,
      effectiveRepoPath
    );
    const originalSlug = metadata.slug;

    const { slug, branch, warning } = await this.slugResolver.resolveUniqueSlug(
      originalSlug,
      effectiveRepoPath
    );

    // Determine next feature number for this repo
    const existingFeatures = await this.featureRepo.list({
      repositoryPath: effectiveRepoPath,
    });
    const featureNumber = existingFeatures.length;

    // Create git worktree branching from the repo's default branch
    const defaultBranch = await this.gitPrService.getDefaultBranch(effectiveRepoPath);

    // Sync the default branch from remote before branching so the feature
    // starts from the latest upstream state. Enabled by default; callers
    // can opt out with `rebaseBeforeBranch: false`.
    if (input.rebaseBeforeBranch !== false) {
      try {
        await this.gitPrService.syncMain(effectiveRepoPath, defaultBranch);
      } catch {
        // Sync failure is non-fatal — proceed with local state.
        // Common case: no remote configured (local-only repos).
      }
    }

    const worktreePath = this.worktreeService.getWorktreePath(effectiveRepoPath, branch);
    await this.worktreeService.create(effectiveRepoPath, branch, worktreePath, defaultBranch);

    // Initialize spec directory — full user input goes into spec.yaml as-is
    const { specDir } = await this.specInitializer.initialize(
      worktreePath,
      slug,
      featureNumber,
      input.userInput,
      feature.mode === FeatureMode.Fast
        ? 'fast'
        : feature.mode === FeatureMode.Exploration
          ? 'exploration'
          : undefined
    );

    // Commit pending attachments if sessionId was provided (web UI flow)
    let committedAttachments = input.attachments;
    if (input.sessionId) {
      try {
        committedAttachments = this.attachmentStorage.commit(input.sessionId, slug);
      } catch {
        // Attachment commit failure should not block feature creation
      }
    }

    // Store CLI --attach files directly (CLI flow)
    if (input.attachmentPaths?.length) {
      try {
        const { readFileSync } = await import('fs');
        const { basename } = await import('path');
        const cliSessionId = `cli-${feature.id}`;
        for (const filePath of input.attachmentPaths) {
          const buffer = readFileSync(filePath);
          const name = basename(filePath);
          this.attachmentStorage.store(buffer, name, 'application/octet-stream', cliSessionId);
        }
        committedAttachments = this.attachmentStorage.commit(cliSessionId, slug);
      } catch {
        // Attachment storage failure should not block feature creation
      }
    }

    // Inject curated skills into the worktree (opt-in, guarded by settings or CLI flag)
    const settings = getSettings();
    const shouldInject = input.injectSkills ?? settings.workflow.skillInjection?.enabled ?? false;
    let injectedSkillNames: string[] | undefined;
    const skillConfig =
      settings.workflow.skillInjection ?? createDefaultSettings().workflow.skillInjection!;
    if (shouldInject && skillConfig.skills?.length) {
      try {
        const result = await this.skillInjector.inject(
          worktreePath,
          skillConfig,
          effectiveRepoPath
        );
        injectedSkillNames = [...result.injected, ...result.skipped];
      } catch {
        // Skill injection failure must not block feature creation (NFR-3)
      }
    }

    // Update feature record with refined metadata, branch, specPath, and attachments
    const updatedFeature: Feature = {
      ...feature,
      name: metadata.name,
      slug,
      description: metadata.description,
      branch,
      specPath: specDir,
      ...(committedAttachments?.length ? { attachments: committedAttachments } : {}),
      ...(injectedSkillNames?.length ? { injectedSkills: injectedSkillNames } : {}),
      updatedAt: new Date(),
    };
    await this.featureRepo.update(updatedFeature);

    // Spawn agent if not blocked
    if (shouldSpawn) {
      // Validate that the configured agent is available before spawning
      // a background worker — prevents the feature from getting stuck
      // with a silent failure in the detached worker process.
      // Skip validation when using mock executor (E2E tests, CI without real agents).
      const effectiveAgentType = (input.agentType as AgentType) ?? settings.agent.type;
      const isMockExecutor = process.env.SHEP_MOCK_EXECUTOR === '1';
      const validation = isMockExecutor
        ? { available: true as const }
        : await this.agentValidator.isAvailable(effectiveAgentType);
      if (!validation.available) {
        // Mark the agent run as failed so the UI shows the error
        await this.runRepository.updateStatus(feature.agentRunId!, AgentRunStatus.failed, {
          error: `Agent "${effectiveAgentType}" is not available: ${validation.error}`,
          completedAt: new Date(),
          updatedAt: new Date(),
        });
        // Update feature lifecycle to Started so it doesn't appear as actively running
        await this.featureRepo.update({
          ...updatedFeature,
          lifecycle: SdlcLifecycle.Started,
          updatedAt: new Date(),
        });
        throw new Error(
          `Agent "${effectiveAgentType}" is not available. ${validation.error ?? 'Please install it and try again.'}`
        );
      }

      const agentRun = await this.runRepository.findById(feature.agentRunId!);
      this.agentProcess.spawn(
        feature.id,
        feature.agentRunId!,
        effectiveRepoPath,
        specDir,
        worktreePath,
        {
          ...(input.approvalGates ? { approvalGates: input.approvalGates } : {}),
          threadId: agentRun?.threadId ?? randomUUID(),
          push: input.push ?? false,
          openPr: input.openPr ?? false,
          forkAndPr: input.forkAndPr ?? false,
          commitSpecs: input.commitSpecs ?? true,
          ciWatchEnabled: input.ciWatchEnabled ?? true,
          enableEvidence: input.enableEvidence ?? false,
          commitEvidence: input.commitEvidence ?? false,
          ...(feature.mode !== FeatureMode.Regular ? { mode: feature.mode } : {}),
          ...(input.agentType ? { agentType: input.agentType as AgentType } : {}),
          ...(input.model ? { model: input.model } : {}),
        }
      );
    }

    return { warning, updatedFeature };
  }
}
