/**
 * Create Project Feature Use Case
 *
 * Composite use case behind "start a new project from a prompt" on the Feature
 * path. Chains CreateProjectUseCase (empty folder + git) with
 * CreateFeatureUseCase (which registers the repository and runs the chosen
 * workflow).
 *
 * The Feature path is stack-agnostic: the user's prompt is passed through
 * unchanged, and a new project with no explicit mode runs the spec-driven
 * workflow so requirements and research choose the stack before any code is
 * written. The opinionated Vite + shadcn builder is CreateApplicationUseCase —
 * a different product path.
 *
 * Two phases, like CreateFeatureFromRemoteUseCase:
 * - createRecord(): project folder + feature record, returns immediately
 * - initializeAndSpawn(): metadata, worktree, spec, agent spawn (background)
 */

import { injectable, inject } from 'tsyringe';
import type { Attachment, BuildMode, Feature } from '../../../../domain/generated/output.js';
import {
  deriveProjectNameFromDescription,
  resolveNewProjectBuildMode,
} from '../../../../domain/shared/new-project.js';
import { CreateProjectUseCase } from '../../projects/create-project.use-case.js';
import { CreateFeatureUseCase } from './create-feature.use-case.js';
import type { CreateFeatureInput, CreateRecordResult } from './types.js';

export interface CreateProjectFeatureInput {
  /** The user's prompt as typed. Names the project folder and the feature. */
  description: string;
  /** Prompt sent to the agent (the description plus any attachment notes). */
  userInput: string;
  /** Workflow to run. Defaults to the spec-driven workflow for a new project. */
  buildMode?: BuildMode;
  agentType?: string;
  model?: string;
  attachments?: Attachment[];
  sessionId?: string;
}

export interface CreateProjectFeatureRecord extends CreateRecordResult {
  /** Absolute path of the new project folder, normalized to forward slashes. */
  repositoryPath: string;
}

@injectable()
export class CreateProjectFeatureUseCase {
  constructor(
    @inject(CreateProjectUseCase)
    private readonly createProjectUseCase: CreateProjectUseCase,
    @inject(CreateFeatureUseCase)
    private readonly createFeatureUseCase: CreateFeatureUseCase
  ) {}

  /**
   * Phase 1: create the empty project folder and the feature record.
   *
   * @throws Error when the project folder cannot be created; no feature is
   *         created in that case.
   */
  async createRecord(input: CreateProjectFeatureInput): Promise<CreateProjectFeatureRecord> {
    const project = await this.createProjectUseCase.execute({
      name: deriveProjectNameFromDescription(input.description),
    });
    if (!project.ok) {
      throw new Error(project.error);
    }

    const record = await this.createFeatureUseCase.createRecord(
      this.toFeatureInput(input, project.path)
    );
    return { ...record, repositoryPath: project.path };
  }

  /** Phase 2: metadata, worktree, spec and agent spawn. */
  async initializeAndSpawn(
    feature: Feature,
    input: CreateProjectFeatureInput,
    shouldSpawn: boolean
  ): Promise<{ warning?: string; updatedFeature: Feature }> {
    return this.createFeatureUseCase.initializeAndSpawn(
      feature,
      this.toFeatureInput(input, feature.repositoryPath),
      shouldSpawn
    );
  }

  private toFeatureInput(
    input: CreateProjectFeatureInput,
    repositoryPath: string
  ): CreateFeatureInput {
    return {
      userInput: input.userInput,
      repositoryPath,
      description: input.description,
      buildMode: resolveNewProjectBuildMode(input.buildMode),
      ...(input.agentType ? { agentType: input.agentType } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    };
  }
}
