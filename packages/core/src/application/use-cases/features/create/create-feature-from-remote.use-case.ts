/**
 * Create Feature From Remote Use Case
 *
 * Composite use case that chains ImportGitHubRepositoryUseCase with
 * CreateFeatureUseCase. Enables creating a feature on a remote GitHub
 * repo in a single command — clone (or fork), register, then create feature.
 *
 * Provides two execution modes:
 * - execute(): synchronous full flow for CLI
 * - createRecord() + initializeAndSpawn(): two-phase for Web UI (fast response + background work)
 */

import { injectable, inject } from 'tsyringe';
import type { Feature } from '../../../../domain/generated/output.js';
import type { ApprovalGates, Attachment } from '../../../../domain/generated/output.js';
import type {
  CloneOptions,
  ForkOptions,
} from '../../../ports/output/services/github-repository-service.interface.js';
import { ImportGitHubRepositoryUseCase } from '../../repositories/import-github-repository.use-case.js';
import { CreateFeatureUseCase } from './create-feature.use-case.js';
import type { CreateFeatureResult, CreateRecordResult } from './types.js';

export interface CreateFeatureFromRemoteInput {
  /** GitHub URL or owner/repo shorthand */
  remoteUrl: string;
  /** Override clone destination directory */
  cloneDest?: string;
  /** Default base directory for clones (from settings) */
  defaultCloneDir?: string;
  /** Options for the clone subprocess */
  cloneOptions?: CloneOptions;
  /** Options for fork operations */
  forkOptions?: ForkOptions;

  // CreateFeatureInput fields (minus repositoryPath, which we derive)
  userInput: string;
  approvalGates?: ApprovalGates;
  push?: boolean;
  openPr?: boolean;
  parentId?: string;
  name?: string;
  description?: string;
  fast?: boolean;
  pending?: boolean;
  agentType?: string;
  model?: string;
  attachments?: Attachment[];
  sessionId?: string;
  attachmentPaths?: string[];
}

@injectable()
export class CreateFeatureFromRemoteUseCase {
  constructor(
    @inject(ImportGitHubRepositoryUseCase)
    private readonly importUseCase: ImportGitHubRepositoryUseCase,
    @inject(CreateFeatureUseCase)
    private readonly createFeatureUseCase: CreateFeatureUseCase
  ) {}

  /**
   * Full synchronous execution: import repo then create feature.
   * Used by the CLI which shows a spinner and needs everything done before returning.
   */
  async execute(input: CreateFeatureFromRemoteInput): Promise<CreateFeatureResult> {
    const repository = await this.importUseCase.execute({
      url: input.remoteUrl,
      dest: input.cloneDest,
      defaultCloneDir: input.defaultCloneDir,
      cloneOptions: input.cloneOptions,
      forkOptions: input.forkOptions,
    });

    return this.createFeatureUseCase.execute({
      userInput: input.userInput,
      repositoryPath: repository.path,
      approvalGates: input.approvalGates,
      push: input.push,
      openPr: input.openPr,
      parentId: input.parentId,
      name: input.name,
      description: input.description,
      fast: input.fast,
      pending: input.pending,
      agentType: input.agentType,
      model: input.model,
      attachments: input.attachments,
      sessionId: input.sessionId,
      attachmentPaths: input.attachmentPaths,
    });
  }

  /**
   * Phase 1 (fast): import repo + create DB record. Returns immediately with real feature ID.
   * Used by the Web UI for optimistic display.
   */
  async createRecord(input: CreateFeatureFromRemoteInput): Promise<CreateRecordResult> {
    const repository = await this.importUseCase.execute({
      url: input.remoteUrl,
      dest: input.cloneDest,
      defaultCloneDir: input.defaultCloneDir,
      cloneOptions: input.cloneOptions,
      forkOptions: input.forkOptions,
    });

    return this.createFeatureUseCase.createRecord({
      userInput: input.userInput,
      repositoryPath: repository.path,
      approvalGates: input.approvalGates,
      push: input.push,
      openPr: input.openPr,
      parentId: input.parentId,
      name: input.name,
      description: input.description,
      fast: input.fast,
      pending: input.pending,
      agentType: input.agentType,
      model: input.model,
      attachments: input.attachments,
      sessionId: input.sessionId,
      attachmentPaths: input.attachmentPaths,
    });
  }

  /**
   * Phase 2 (background): metadata generation, worktree, spec, agent spawn.
   * Fire-and-forget from the Web UI.
   */
  async initializeAndSpawn(
    feature: Feature,
    input: CreateFeatureFromRemoteInput,
    shouldSpawn: boolean
  ): Promise<{ warning?: string; updatedFeature: Feature }> {
    return this.createFeatureUseCase.initializeAndSpawn(
      feature,
      {
        userInput: input.userInput,
        // CreateFeatureUseCase.initializeAndSpawn reads the effective repo path
        // from feature.repositoryPath, but the interface still requires this
        // field. Pass the feature's repositoryPath for consistency.
        repositoryPath: feature.repositoryPath,
        approvalGates: input.approvalGates,
        push: input.push,
        openPr: input.openPr,
        parentId: input.parentId,
        name: input.name,
        description: input.description,
        fast: input.fast,
        pending: input.pending,
        agentType: input.agentType,
        model: input.model,
        attachments: input.attachments,
        sessionId: input.sessionId,
        attachmentPaths: input.attachmentPaths,
      },
      shouldSpawn
    );
  }
}
