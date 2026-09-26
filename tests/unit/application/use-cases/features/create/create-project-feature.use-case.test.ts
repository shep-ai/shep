/**
 * CreateProjectFeatureUseCase Unit Tests
 *
 * The composite behind "start a new project from a prompt" on the Feature
 * path: an empty project folder, then a feature on it. It must never inject a
 * technology stack into the user's prompt, and a new project with no explicit
 * mode runs the spec-driven workflow.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateProjectFeatureUseCase,
  type CreateProjectFeatureInput,
} from '@/application/use-cases/features/create/create-project-feature.use-case.js';
import type { CreateProjectUseCase } from '@/application/use-cases/projects/create-project.use-case.js';
import type { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { Feature } from '@/domain/generated/output.js';
import { BuildMode, SdlcLifecycle } from '@/domain/generated/output.js';

const PROJECT_PATH = '/home/user/.shep/projects/a-booking-tool-for-climbing-gyms';

function createMockFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feature-1',
    name: 'Booking tool',
    slug: 'booking-tool',
    description: 'A booking tool',
    userQuery: 'A booking tool',
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

const PROMPT = 'A booking tool for climbing gyms with waitlists and payments';

const baseInput: CreateProjectFeatureInput = {
  description: PROMPT,
  userInput: PROMPT,
};

describe('CreateProjectFeatureUseCase', () => {
  let useCase: CreateProjectFeatureUseCase;
  let createProject: CreateProjectUseCase;
  let createFeature: CreateFeatureUseCase;
  let feature: Feature;

  beforeEach(() => {
    feature = createMockFeature();
    createProject = {
      execute: vi.fn().mockResolvedValue({ ok: true, path: PROJECT_PATH }),
    } as unknown as CreateProjectUseCase;
    createFeature = {
      createRecord: vi.fn().mockResolvedValue({ feature, shouldSpawn: true, queued: false }),
      initializeAndSpawn: vi.fn().mockResolvedValue({ updatedFeature: feature }),
    } as unknown as CreateFeatureUseCase;
    useCase = new CreateProjectFeatureUseCase(createProject, createFeature);
  });

  describe('createRecord()', () => {
    it('creates a project folder named after the start of the prompt', async () => {
      await useCase.createRecord(baseInput);

      expect(createProject.execute).toHaveBeenCalledWith({
        name: 'A booking tool for climbing gyms',
      });
    });

    it('creates the feature on the new folder with the prompt unchanged', async () => {
      const result = await useCase.createRecord(baseInput);

      const call = vi.mocked(createFeature.createRecord).mock.calls[0][0];
      expect(call.repositoryPath).toBe(PROJECT_PATH);
      expect(call.userInput).toBe(PROMPT);
      expect(call.description).toBe(PROMPT);
      expect(result).toEqual({
        feature,
        shouldSpawn: true,
        queued: false,
        repositoryPath: PROJECT_PATH,
      });
    });

    it('never injects a technology stack into the prompt', async () => {
      await useCase.createRecord(baseInput);

      const call = vi.mocked(createFeature.createRecord).mock.calls[0][0];
      expect(call.userInput).not.toMatch(/react|vite|tailwind|shadcn/i);
    });

    it('runs the spec-driven workflow when no mode is requested', async () => {
      await useCase.createRecord(baseInput);

      const call = vi.mocked(createFeature.createRecord).mock.calls[0][0];
      expect(call.buildMode).toBe(BuildMode.Spec);
    });

    it('honours an explicitly requested fast mode', async () => {
      await useCase.createRecord({ ...baseInput, buildMode: BuildMode.Fast });

      const call = vi.mocked(createFeature.createRecord).mock.calls[0][0];
      expect(call.buildMode).toBe(BuildMode.Fast);
    });

    it('forwards agent, model, attachments and session', async () => {
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
      await useCase.createRecord({
        ...baseInput,
        agentType: 'codex-cli',
        model: 'gpt-5',
        sessionId: 'session-1',
        attachments,
      });

      const call = vi.mocked(createFeature.createRecord).mock.calls[0][0];
      expect(call).toMatchObject({
        agentType: 'codex-cli',
        model: 'gpt-5',
        sessionId: 'session-1',
        attachments,
      });
    });

    it('fails without creating a feature when the project folder cannot be created', async () => {
      vi.mocked(createProject.execute).mockResolvedValue({
        ok: false,
        error: 'A project named "x" already exists. Pick a different name.',
      });

      await expect(useCase.createRecord(baseInput)).rejects.toThrow('already exists');
      expect(createFeature.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('initializeAndSpawn()', () => {
    it('initializes against the feature repository with the same resolved mode', async () => {
      await useCase.initializeAndSpawn(feature, baseInput, true);

      const [passedFeature, passedInput, shouldSpawn] = vi.mocked(createFeature.initializeAndSpawn)
        .mock.calls[0];
      expect(passedFeature).toBe(feature);
      expect(passedInput.repositoryPath).toBe(PROJECT_PATH);
      expect(passedInput.userInput).toBe(PROMPT);
      expect(passedInput.buildMode).toBe(BuildMode.Spec);
      expect(shouldSpawn).toBe(true);
    });
  });
});
