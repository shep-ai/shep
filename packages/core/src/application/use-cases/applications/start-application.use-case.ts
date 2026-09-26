/**
 * Start Application Use Case
 *
 * The single entry point for "start a new app, then add features". Every new
 * project becomes an Application; the starter decides how it gets its first
 * code:
 *
 * - `ApplicationStarter.Blank` (default): an empty project, an Application
 *   record, and a first feature linked to it. The feature is spec-driven by
 *   default, so requirements and research choose the stack before any code is
 *   written. The user's prompt is passed through unchanged — this path never
 *   injects a technology choice.
 * - `ApplicationStarter.ViteShadcn`: the opinionated Vite + React + Tailwind +
 *   shadcn template, built from chat by CreateApplicationUseCase.
 *
 * Later features attach to the app automatically: CreateFeatureUseCase links
 * any feature created on the app's repository.
 *
 * Presentation-agnostic: the CLI waits for the first feature's setup; the web
 * returns as soon as the records exist and lets setup continue in background.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  ApplicationStarter,
  ApplicationStatus,
  type Application,
  type Attachment,
  type BuildMode,
  type Feature,
} from '../../../domain/generated/output.js';
import { resolveNewProjectBuildMode } from '../../../domain/shared/new-project.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import { CreateProjectUseCase } from '../projects/create-project.use-case.js';
import { CreateFeatureUseCase } from '../features/create/create-feature.use-case.js';
import type { CreateFeatureInput } from '../features/create/types.js';
import { CreateApplicationUseCase } from './create-application.use-case.js';
import { ApplicationProjectAllocator } from './application-project-allocator.js';

export interface StartApplicationInput {
  /** The user's idea as typed. Names the app and its first feature. */
  description: string;
  /** Prompt for the first feature's agent. Defaults to the description. */
  userInput?: string;
  /** How the app gets its first code. Defaults to a blank project. */
  starter?: ApplicationStarter;
  /** Workflow of the first feature (blank starter). Defaults to spec-driven. */
  buildMode?: BuildMode;
  agentType?: string;
  model?: string;
  attachments?: Attachment[];
  sessionId?: string;
}

export interface StartApplicationOptions {
  /**
   * Wait until the first feature's worktree, spec and agent are set up
   * (default). Pass false to return once the records exist and continue the
   * setup in the background — failures are then logged, not thrown.
   */
  awaitFeatureSetup?: boolean;
}

export interface StartApplicationResult {
  application: Application;
  /** Absolute path of the app's project folder. */
  repositoryPath: string;
  /** The app's first feature (blank starter only). */
  feature?: Feature;
}

@injectable()
export class StartApplicationUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject(CreateProjectUseCase)
    private readonly createProject: CreateProjectUseCase,
    @inject(CreateApplicationUseCase)
    private readonly createApplication: CreateApplicationUseCase,
    @inject(CreateFeatureUseCase)
    private readonly createFeature: CreateFeatureUseCase,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(
    input: StartApplicationInput,
    options: StartApplicationOptions = {}
  ): Promise<StartApplicationResult> {
    if ((input.starter ?? ApplicationStarter.Blank) === ApplicationStarter.ViteShadcn) {
      return this.createApplication.execute({
        description: input.description,
        agentType: input.agentType,
        modelOverride: input.model,
        initialPrompt: input.description,
      });
    }
    return this.startBlank(input, options.awaitFeatureSetup ?? true);
  }

  private async startBlank(
    input: StartApplicationInput,
    awaitFeatureSetup: boolean
  ): Promise<StartApplicationResult> {
    const { slug, name, projectPath } = await new ApplicationProjectAllocator(
      this.appRepo,
      this.createProject
    ).allocate(input.description);

    const now = new Date();
    const application: Application = {
      id: randomUUID(),
      name,
      slug,
      description: input.description,
      repositoryPath: projectPath,
      additionalPaths: [],
      status: ApplicationStatus.Idle,
      // Nothing to scaffold: the first feature produces the code.
      setupComplete: true,
      ...(input.agentType ? { agentType: input.agentType } : {}),
      ...(input.model ? { modelOverride: input.model } : {}),
      bedrockEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.appRepo.create(application);

    const featureInput = this.firstFeatureInput(input, application);
    if (awaitFeatureSetup) {
      const { feature } = await this.createFeature.execute(featureInput);
      return { application, repositoryPath: projectPath, feature };
    }

    const { feature, shouldSpawn } = await this.createFeature.createRecord(featureInput);
    this.createFeature.initializeAndSpawn(feature, featureInput, shouldSpawn).catch((err) => {
      this.logger.error('[start-application] first feature setup failed', {
        applicationId: application.id,
        featureId: feature.id,
        err: err instanceof Error ? err.message : String(err),
      });
    });
    return { application, repositoryPath: projectPath, feature };
  }

  private firstFeatureInput(
    input: StartApplicationInput,
    application: Application
  ): CreateFeatureInput {
    return {
      userInput: input.userInput ?? input.description,
      description: input.description,
      repositoryPath: application.repositoryPath,
      applicationId: application.id,
      buildMode: resolveNewProjectBuildMode(input.buildMode),
      ...(input.agentType ? { agentType: input.agentType } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    };
  }
}
