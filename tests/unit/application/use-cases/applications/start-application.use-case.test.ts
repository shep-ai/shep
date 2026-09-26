/**
 * StartApplicationUseCase Unit Tests
 *
 * "Start an app, then add features." Every new project is an Application:
 * - blank starter: empty project + Application + a first feature linked to it
 *   (spec-driven by default, so research chooses the stack);
 * - vite-shadcn starter: the opinionated template via CreateApplicationUseCase.
 * The user's prompt is never rewritten with a technology choice.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StartApplicationUseCase,
  type StartApplicationInput,
} from '@/application/use-cases/applications/start-application.use-case.js';
import type { CreateApplicationUseCase } from '@/application/use-cases/applications/create-application.use-case.js';
import type { CreateProjectUseCase } from '@/application/use-cases/projects/create-project.use-case.js';
import type { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { Application, Feature } from '@/domain/generated/output.js';
import {
  ApplicationStarter,
  ApplicationStatus,
  BuildMode,
  SdlcLifecycle,
} from '@/domain/generated/output.js';

const PROJECT_PATH = '/home/user/.shep/projects/booking-tool-climbing-gyms-a1b2c3';
const PROMPT = 'A booking tool for climbing gyms with waitlists and payments';

function createMockFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feature-1',
    name: 'Booking tool',
    slug: 'booking-tool',
    description: PROMPT,
    userQuery: PROMPT,
    repositoryPath: PROJECT_PATH,
    branch: 'feat/booking-tool',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Spec,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

const baseInput: StartApplicationInput = { description: PROMPT };

describe('StartApplicationUseCase', () => {
  let useCase: StartApplicationUseCase;
  let appRepo: IApplicationRepository;
  let createProject: CreateProjectUseCase;
  let createApplication: CreateApplicationUseCase;
  let createFeature: CreateFeatureUseCase;
  let logger: ILogger;
  let feature: Feature;

  beforeEach(() => {
    feature = createMockFeature();
    appRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findBySlug: vi.fn().mockResolvedValue(null),
    } as unknown as IApplicationRepository;
    createProject = {
      execute: vi.fn().mockResolvedValue({ ok: true, path: PROJECT_PATH }),
    } as unknown as CreateProjectUseCase;
    createApplication = {
      execute: vi.fn().mockResolvedValue({
        application: { id: 'vite-app' },
        repositoryPath: '/projects/vite-app',
      }),
    } as unknown as CreateApplicationUseCase;
    createFeature = {
      execute: vi.fn().mockResolvedValue({ feature, queued: false }),
      createRecord: vi.fn().mockResolvedValue({ feature, shouldSpawn: true, queued: false }),
      initializeAndSpawn: vi.fn().mockResolvedValue({ updatedFeature: feature }),
    } as unknown as CreateFeatureUseCase;
    logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as never;
    useCase = new StartApplicationUseCase(
      appRepo,
      createProject,
      createApplication,
      createFeature,
      logger
    );
  });

  function createdApplication(): Application {
    return vi.mocked(appRepo.create).mock.calls[0][0];
  }

  describe('blank starter (default)', () => {
    it('creates an Application on a new empty project', async () => {
      const result = await useCase.execute(baseInput);

      const projectName = vi.mocked(createProject.execute).mock.calls[0][0].name;
      expect(projectName).toMatch(/^booking-tool-climbing-gyms-waitlists-[0-9a-f]{6}$/);
      const app = createdApplication();
      expect(app).toMatchObject({
        name: 'Booking Tool Climbing Gyms Waitlists',
        slug: projectName,
        description: PROMPT,
        repositoryPath: PROJECT_PATH,
        status: ApplicationStatus.Idle,
        setupComplete: true,
      });
      expect(result.application).toBe(app);
      expect(result.repositoryPath).toBe(PROJECT_PATH);
      expect(createApplication.execute).not.toHaveBeenCalled();
    });

    it('starts the first feature inside the app with the prompt unchanged', async () => {
      const result = await useCase.execute(baseInput);

      const call = vi.mocked(createFeature.execute).mock.calls[0][0];
      expect(call).toMatchObject({
        userInput: PROMPT,
        description: PROMPT,
        repositoryPath: PROJECT_PATH,
        applicationId: createdApplication().id,
      });
      expect(call.userInput).not.toMatch(/react|vite|tailwind|shadcn/i);
      expect(result.feature).toBe(feature);
    });

    it('makes the first feature spec-driven unless a mode is requested', async () => {
      await useCase.execute(baseInput);
      await useCase.execute({ ...baseInput, buildMode: BuildMode.Fast });

      const calls = vi.mocked(createFeature.execute).mock.calls;
      expect(calls[0][0].buildMode).toBe(BuildMode.Spec);
      expect(calls[1][0].buildMode).toBe(BuildMode.Fast);
    });

    it('forwards agent, model, attachments and session to the first feature', async () => {
      const attachments = [
        {
          id: 'a1',
          name: 'brief.md',
          size: BigInt(10),
          mimeType: 'text/markdown',
          path: '/tmp/brief.md',
          createdAt: new Date(),
        },
      ];
      await useCase.execute({
        ...baseInput,
        userInput: `${PROMPT}\n\n@/tmp/brief.md`,
        agentType: 'codex-cli',
        model: 'gpt-5',
        sessionId: 'session-1',
        attachments,
      });

      expect(vi.mocked(createFeature.execute).mock.calls[0][0]).toMatchObject({
        userInput: `${PROMPT}\n\n@/tmp/brief.md`,
        description: PROMPT,
        agentType: 'codex-cli',
        model: 'gpt-5',
        sessionId: 'session-1',
        attachments,
      });
      expect(createdApplication()).toMatchObject({
        agentType: 'codex-cli',
        modelOverride: 'gpt-5',
      });
    });

    it('fails without an app or feature when the project folder cannot be created', async () => {
      vi.mocked(createProject.execute).mockResolvedValue({ ok: false, error: 'disk full' });

      await expect(useCase.execute(baseInput)).rejects.toThrow('disk full');
      expect(appRepo.create).not.toHaveBeenCalled();
      expect(createFeature.execute).not.toHaveBeenCalled();
    });

    it('can return before the first feature finishes setting up', async () => {
      let finishSetup: (value: unknown) => void = () => undefined;
      vi.mocked(createFeature.initializeAndSpawn).mockReturnValue(
        new Promise((resolve) => {
          finishSetup = resolve;
        }) as never
      );

      const result = await useCase.execute(baseInput, { awaitFeatureSetup: false });

      expect(result.feature).toBe(feature);
      expect(createFeature.createRecord).toHaveBeenCalledOnce();
      expect(createFeature.initializeAndSpawn).toHaveBeenCalledWith(
        feature,
        expect.objectContaining({ applicationId: createdApplication().id }),
        true
      );
      expect(createFeature.execute).not.toHaveBeenCalled();
      finishSetup({ updatedFeature: feature });
    });

    it('logs a background setup failure instead of throwing', async () => {
      vi.mocked(createFeature.initializeAndSpawn).mockRejectedValue(new Error('worktree failed'));

      await useCase.execute(baseInput, { awaitFeatureSetup: false });
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    });
  });

  describe('vite-shadcn starter', () => {
    it('delegates to the Vite + shadcn application builder with the prompt', async () => {
      const result = await useCase.execute({
        ...baseInput,
        starter: ApplicationStarter.ViteShadcn,
        agentType: 'claude-code',
        model: 'opus',
      });

      expect(createApplication.execute).toHaveBeenCalledWith({
        description: PROMPT,
        agentType: 'claude-code',
        modelOverride: 'opus',
        initialPrompt: PROMPT,
      });
      expect(result).toEqual({
        application: { id: 'vite-app' },
        repositoryPath: '/projects/vite-app',
      });
      expect(createFeature.execute).not.toHaveBeenCalled();
      expect(createFeature.createRecord).not.toHaveBeenCalled();
    });
  });
});
