import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateApplicationUseCase,
  randomSlugTag,
} from '@/application/use-cases/applications/create-application.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IApplicationCreationPromptBuilder } from '@/application/ports/output/services/application-creation-prompt-builder.interface.js';
import type { IApplicationBriefStore } from '@/application/ports/output/services/application-brief-store.interface.js';
import type { CreateProjectUseCase } from '@/application/use-cases/projects/create-project.use-case.js';
import type { SendInteractiveMessageUseCase } from '@/application/use-cases/interactive/send-interactive-message.use-case.js';
import type { RunWorkflowUseCase } from '@/application/use-cases/workflows/run-workflow.use-case.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import { ApplicationStatus } from '@/domain/generated/output.js';

function createMockAppRepo(): IApplicationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };
}

function createMockCreateProject(): CreateProjectUseCase {
  return {
    execute: vi
      .fn()
      .mockImplementation((input: { name: string }) =>
        Promise.resolve({ ok: true, path: `/shep/projects/${input.name}` })
      ),
  } as unknown as CreateProjectUseCase;
}

function createMockPromptBuilder(): IApplicationCreationPromptBuilder {
  return {
    build: vi.fn().mockImplementation(({ description }) => ({
      systemPrompt: `SYSTEM(${description})`,
      userMessage: description,
    })),
  };
}

function createMockSendMessage(): SendInteractiveMessageUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      id: 'msg-1',
      featureId: 'app-test',
      role: 'user',
      content: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  } as unknown as SendInteractiveMessageUseCase;
}

function createMockBriefStore(): IApplicationBriefStore {
  return {
    write: vi
      .fn()
      .mockImplementation((applicationId: string) =>
        Promise.resolve(`/fake/shep/application-briefs/${applicationId}.md`)
      ),
  };
}

describe('CreateApplicationUseCase', () => {
  let useCase: CreateApplicationUseCase;
  let mockAppRepo: IApplicationRepository;
  let mockCreateProject: CreateProjectUseCase;
  let mockPromptBuilder: IApplicationCreationPromptBuilder;
  let mockSendMessage: SendInteractiveMessageUseCase;
  let mockBriefStore: IApplicationBriefStore;
  let mockRunWorkflow: RunWorkflowUseCase;
  let mockSessionRepo: IInteractiveSessionRepository;

  beforeEach(() => {
    mockAppRepo = createMockAppRepo();
    mockCreateProject = createMockCreateProject();
    mockPromptBuilder = createMockPromptBuilder();
    mockSendMessage = createMockSendMessage();
    mockBriefStore = createMockBriefStore();
    mockRunWorkflow = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as RunWorkflowUseCase;
    mockSessionRepo = {
      findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
    } as unknown as IInteractiveSessionRepository;
    useCase = new CreateApplicationUseCase(
      mockAppRepo,
      mockCreateProject,
      mockPromptBuilder,
      mockSendMessage,
      mockBriefStore,
      mockRunWorkflow,
      mockSessionRepo
    );
  });

  it('creates application with scaffolded project (slug = stem-<random>)', async () => {
    const result = await useCase.execute({ description: 'Build a REST API for users' });

    // CreateProjectUseCase was called with the random-tagged slug
    expect(mockCreateProject.execute).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(mockCreateProject.execute).mock.calls[0][0];
    expect(arg.name).toMatch(/^rest-api-users-[0-9a-f]{6}$/);

    // Application was persisted with the same slug
    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: arg.name,
        description: 'Build a REST API for users',
        repositoryPath: `/shep/projects/${arg.name}`,
        additionalPaths: [],
        status: ApplicationStatus.Idle,
      })
    );

    expect(result.application.slug).toBe(arg.name);
    // The human-readable name is derived from the BASE slug only — the
    // random hex tag stays on `slug` (and the worktree path) where it
    // exists for uniqueness, but the user-facing title is clean. Names
    // are allowed to duplicate; uniqueness is enforced on `slug`.
    expect(result.application.name).toBe('Rest Api Users');
    expect(result.repositoryPath).toBe(`/shep/projects/${arg.name}`);
  });

  it('passes agent and model overrides through to the application record', async () => {
    const result = await useCase.execute({
      description: 'Chat assistant',
      agentType: 'openai',
      modelOverride: 'gpt-4o',
    });

    expect(result.application.agentType).toBe('openai');
    expect(result.application.modelOverride).toBe('gpt-4o');

    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'openai',
        modelOverride: 'gpt-4o',
      })
    );
  });

  it('retries with a fresh tag when the first random slug already exists in DB', async () => {
    // First random tag clashes, second is free
    vi.mocked(mockAppRepo.findBySlug)
      .mockResolvedValueOnce({
        id: 'existing-id',
        name: 'Chat Assistant',
        slug: 'chat-assistant-aaa111',
        description: 'An existing app',
        repositoryPath: '/shep/projects/chat-assistant-aaa111',
        additionalPaths: [],
        status: ApplicationStatus.Idle,
        setupComplete: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce(null);

    const result = await useCase.execute({ description: 'Chat assistant' });

    // Two slugs were checked; the second one was used to scaffold
    expect(mockAppRepo.findBySlug).toHaveBeenCalledTimes(2);
    expect(mockCreateProject.execute).toHaveBeenCalledTimes(1);
    expect(result.application.slug).toMatch(/^chat-assistant-[0-9a-f]{6}$/);
  });

  it('retries when CreateProjectUseCase reports the folder already exists', async () => {
    vi.mocked(mockCreateProject.execute)
      .mockResolvedValueOnce({ ok: false, error: 'folder exists' })
      .mockResolvedValueOnce({ ok: true, path: '/shep/projects/dashboard-team-bbb222' });

    const result = await useCase.execute({ description: 'Create a dashboard for my team' });

    expect(mockCreateProject.execute).toHaveBeenCalledTimes(2);
    expect(result.application.slug).toMatch(/^dashboard-team-[0-9a-f]{6}$/);
  });

  it('throws after MAX_ATTEMPTS exhausted folder collisions', async () => {
    vi.mocked(mockCreateProject.execute).mockResolvedValue({
      ok: false,
      error: 'folder always exists',
    });

    await expect(useCase.execute({ description: 'Some app' })).rejects.toThrow(
      /folder always exists/i
    );
    expect(mockCreateProject.execute).toHaveBeenCalledTimes(5);
  });

  it('applies stop-word filtering when building the slug stem', async () => {
    const result = await useCase.execute({ description: 'Create a dashboard for my team' });
    // Stem keeps "dashboard", "team" then a random tag is appended
    expect(result.application.slug).toMatch(/^dashboard-team-[0-9a-f]{6}$/);
  });

  it('falls back to "application" stem when all words are stop words', async () => {
    const result = await useCase.execute({ description: 'build create make' });
    expect(result.application.slug).toMatch(/^application-[0-9a-f]{6}$/);
  });

  it('does NOT send a chat message when initialPrompt is omitted', async () => {
    await useCase.execute({ description: 'a quiet app' });
    expect(mockPromptBuilder.build).not.toHaveBeenCalled();
    expect(mockRunWorkflow.execute).not.toHaveBeenCalled();
  });

  it('builds the split prompt and dispatches the workflow orchestrator with a brief-read kickoff wrapper', async () => {
    const result = await useCase.execute({
      description: 'A landing page',
      initialPrompt: 'A landing page',
      agentType: 'claude-code',
      modelOverride: 'claude-sonnet-4-6',
    });

    // Prompt builder receives the trimmed user description AND the
    // workspace facts (cwd + platform) so the agent knows where it is
    // without wasting a turn running `pwd`.
    expect(mockPromptBuilder.build).toHaveBeenCalledWith({
      description: 'A landing page',
      workspace: {
        workingDirectory: result.repositoryPath,
        platform: expect.stringMatching(/^(posix|windows)$/) as unknown as 'posix' | 'windows',
      },
    });

    // The Shep brief is materialized OUTSIDE the scaffolded project —
    // in Shep home under `application-briefs/<id>.md`. The V2 Agent
    // SDK's SDKSessionOptions has no systemPrompt field, so the only
    // reliable way to deliver the brief is as a real on-disk file
    // the agent reads via its Read tool on turn 1. Keeping it out of
    // the project directory prevents leaking Shep internals into the
    // user's codebase.
    expect(mockBriefStore.write).toHaveBeenCalledTimes(1);
    expect(mockBriefStore.write).toHaveBeenCalledWith(
      result.application.id,
      'SYSTEM(A landing page)'
    );

    // The orchestrator is dispatched asynchronously (fire-and-
    // forget) with the workflow definition, featureId, worktree,
    // visible first message, and a first-step wrapper that carries
    // the brief-read directive. The use case returns without
    // waiting, so we give the next microtask a chance to run
    // before asserting.
    await new Promise((r) => setImmediate(r));
    expect(mockRunWorkflow.execute).toHaveBeenCalledTimes(1);
    const runArgs = vi.mocked(mockRunWorkflow.execute).mock.calls[0]![0];
    expect(runArgs).toMatchObject({
      featureId: `app-${result.application.id}`,
      worktreePath: result.repositoryPath,
      model: 'claude-sonnet-4-6',
      agentType: 'claude-code',
      visibleFirstMessage: 'A landing page',
    });
    expect(runArgs.workflow).toBeDefined();
    // The first-step wrapper, when applied to any step prompt,
    // produces the brief-read directive with the absolute brief
    // path and the user's verbatim description.
    expect(runArgs.firstStepPromptWrapper).toBeDefined();
    const wrapped = runArgs.firstStepPromptWrapper!('STEP_PROMPT_BODY');
    expect(wrapped).toContain(`/fake/shep/application-briefs/${result.application.id}.md`);
    expect(wrapped).toContain('A landing page');
    expect(wrapped).toContain('STEP_PROMPT_BODY');
  });

  it('trims whitespace from initialPrompt before building the prompt', async () => {
    await useCase.execute({
      description: 'X',
      initialPrompt: '   build me a portfolio   ',
    });
    expect(mockPromptBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'build me a portfolio' })
    );
  });

  it('skips the chat message when initialPrompt is only whitespace', async () => {
    await useCase.execute({ description: 'X', initialPrompt: '   ' });
    expect(mockPromptBuilder.build).not.toHaveBeenCalled();
    expect(mockRunWorkflow.execute).not.toHaveBeenCalled();
  });
});

describe('randomSlugTag', () => {
  it('returns a 6-character lowercase hex string', () => {
    for (let i = 0; i < 50; i++) {
      const tag = randomSlugTag();
      expect(tag).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it('produces different values across calls (very high probability)', () => {
    const tags = new Set<string>();
    for (let i = 0; i < 100; i++) tags.add(randomSlugTag());
    // 100 samples from a 16M space — collisions are astronomically unlikely
    expect(tags.size).toBeGreaterThanOrEqual(99);
  });
});
