import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateApplicationUseCase,
  randomSlugTag,
} from '@/application/use-cases/applications/create-application.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IApplicationCreationPromptBuilder } from '@/application/ports/output/services/application-creation-prompt-builder.interface.js';
import type { IApplicationBriefStore } from '@/application/ports/output/services/application-brief-store.interface.js';
import type { IApplicationScaffolder } from '@/application/ports/output/services/application-scaffolder.interface.js';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IOperationLogRepository } from '@/application/ports/output/repositories/operation-log.repository.interface.js';
import type { CreateProjectUseCase } from '@/application/use-cases/projects/create-project.use-case.js';
import type { SendInteractiveMessageUseCase } from '@/application/use-cases/interactive/send-interactive-message.use-case.js';
import type { RunWorkflowUseCase } from '@/application/use-cases/workflows/run-workflow.use-case.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
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

function createMockScaffolder(): IApplicationScaffolder {
  return {
    scaffold: vi.fn().mockImplementation(({ repositoryPath }: { repositoryPath: string }) =>
      Promise.resolve({
        repositoryPath,
        templateFiles: [],
        templateVersion: 'test-0',
      })
    ),
  };
}

function createMockMessageRepo(): IInteractiveMessageRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByFeatureId: vi.fn().mockResolvedValue([]),
    findBySessionId: vi.fn().mockResolvedValue([]),
    deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOperationLogRepo(): IOperationLogRepository {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    listByScope: vi.fn().mockResolvedValue([]),
    pruneBefore: vi.fn().mockResolvedValue(0),
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
  let mockScaffolder: IApplicationScaffolder;
  let mockMessageRepo: IInteractiveMessageRepository;
  let mockOperationLogRepo: IOperationLogRepository;
  let mockLogger: ILogger;

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
    mockScaffolder = createMockScaffolder();
    mockMessageRepo = createMockMessageRepo();
    mockOperationLogRepo = createMockOperationLogRepo();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    useCase = new CreateApplicationUseCase(
      mockAppRepo,
      mockCreateProject,
      mockPromptBuilder,
      mockSendMessage,
      mockBriefStore,
      mockRunWorkflow,
      mockSessionRepo,
      mockScaffolder,
      mockMessageRepo,
      mockOperationLogRepo,
      mockLogger
    );
  });

  it('creates application with scaffolded project (slug = stem-<random>)', async () => {
    const result = await useCase.execute({ description: 'Build a REST API for users' });

    // CreateProjectUseCase was called with the random-tagged slug
    expect(mockCreateProject.execute).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(mockCreateProject.execute).mock.calls[0][0];
    expect(arg.name).toMatch(/^rest-api-users-[0-9a-f]{6}$/);

    // The Application row must be persisted BEFORE the scaffold runs
    // so the caller (HTTP server action, CLI, TUI) returns in
    // milliseconds and the user can navigate to the application page
    // with a spinner while the 30s+ scaffold runs in the background.
    // This is a HARD regression guard — an earlier patch awaited the
    // scaffold inline and froze every presentation layer for the full
    // bun+shadcn+install pipeline duration.
    expect(mockAppRepo.create).toHaveBeenCalledTimes(1);
    const createCallOrder = vi.mocked(mockAppRepo.create).mock.invocationCallOrder[0];
    if (vi.mocked(mockScaffolder.scaffold).mock.invocationCallOrder[0] !== undefined) {
      const scaffoldCallOrder = vi.mocked(mockScaffolder.scaffold).mock.invocationCallOrder[0];
      expect(createCallOrder).toBeLessThan(scaffoldCallOrder);
    }

    // Scaffolder is still invoked with the resolved project path + name
    // (but fire-and-forget — we wait a microtask tick for the
    // background dispatch to reach it).
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockScaffolder.scaffold).toHaveBeenCalledTimes(1);
    expect(mockScaffolder.scaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryPath: `/shep/projects/${arg.name}`,
        projectName: 'Rest Api Users',
      })
    );

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

  it('returns immediately and flips status to Error when the background scaffold throws', async () => {
    vi.mocked(mockScaffolder.scaffold).mockRejectedValueOnce(new Error('bun bootstrap failed'));

    // The use case must resolve successfully — the scaffold runs in
    // the background and any failure there is surfaced via a status
    // update on the already-persisted Application row, NOT via a
    // rejected promise. Re-throwing would freeze every presentation
    // layer on the create flow.
    const result = await useCase.execute({ description: 'A broken app' });
    expect(result.application).toBeDefined();
    expect(mockAppRepo.create).toHaveBeenCalledTimes(1);
    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApplicationStatus.Idle })
    );

    // Wait for the background dispatch to run through the rejected
    // scaffold and the subsequent status flip.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    // Scaffold was attempted, workflow was NOT dispatched, and the
    // row was updated to Error so the Applications page can surface
    // the failure.
    expect(mockScaffolder.scaffold).toHaveBeenCalledTimes(1);
    expect(mockRunWorkflow.execute).not.toHaveBeenCalled();
    expect(mockAppRepo.update).toHaveBeenCalledWith(
      result.application.id,
      expect.objectContaining({ status: ApplicationStatus.Error })
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[create-application] scaffold failed',
      expect.objectContaining({ err: 'bun bootstrap failed' })
    );
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
    // Background scaffold still runs, but without initialPrompt the
    // workflow + prompt builder must be skipped. Wait for the
    // background dispatch to reach the skip branch first.
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockPromptBuilder.build).not.toHaveBeenCalled();
    expect(mockRunWorkflow.execute).not.toHaveBeenCalled();
    // No message row either — nothing to pre-persist when there is
    // no user-authored prompt.
    expect(mockMessageRepo.create).not.toHaveBeenCalled();
  });

  it('pre-persists the user first-message IMMEDIATELY, before any background work', async () => {
    const result = await useCase.execute({
      description: 'Build a todo list app',
      initialPrompt: 'Build a todo list app',
    });

    // The message row must land BEFORE the scaffold runs — otherwise
    // the chat page SSR would see no messages on first paint and the
    // user's bubble would only appear after the 30-second scaffold +
    // session boot completed. HARD regression guard.
    expect(mockMessageRepo.create).toHaveBeenCalledTimes(1);
    const createMessageOrder = vi.mocked(mockMessageRepo.create).mock.invocationCallOrder[0];

    // Scaffold may or may not have started yet at this point — the
    // background dispatch is fire-and-forget. Give it a tick and then
    // assert the ordering.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const scaffoldOrder = vi.mocked(mockScaffolder.scaffold).mock.invocationCallOrder[0];
    expect(createMessageOrder).toBeLessThan(scaffoldOrder);

    // The persisted row carries the user's verbatim description, the
    // correct featureId shape (`app-<uuid>`), and a fresh UUID.
    const persisted = vi.mocked(mockMessageRepo.create).mock.calls[0]![0];
    expect(persisted.featureId).toBe(`app-${result.application.id}`);
    expect(persisted.role).toBe('user');
    expect(persisted.content).toBe('Build a todo list app');
    expect(persisted.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tells run-workflow that the first user message is already persisted', async () => {
    await useCase.execute({
      description: 'Build a portfolio site',
      initialPrompt: 'Build a portfolio site',
    });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    // run-workflow must NOT create a duplicate bubble for the user's
    // first turn — the flag below routes its first sendMessage.execute
    // through the `persistUserMessage: false` path in the session.
    expect(mockRunWorkflow.execute).toHaveBeenCalledWith(
      expect.objectContaining({ firstUserMessageAlreadyPersisted: true })
    );
  });

  it('builds the split prompt and dispatches the workflow orchestrator with a brief-read kickoff wrapper', async () => {
    const result = await useCase.execute({
      description: 'A landing page',
      initialPrompt: 'A landing page',
      agentType: 'claude-code',
      modelOverride: 'claude-sonnet-4-6',
    });

    // Prompt builder + brief write + workflow dispatch all live in the
    // background pipeline now, so wait for the dispatch to reach them
    // before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

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
    // Background dispatch runs scaffold → then prompt build.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockPromptBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'build me a portfolio' })
    );
  });

  it('skips the chat message when initialPrompt is only whitespace', async () => {
    await useCase.execute({ description: 'X', initialPrompt: '   ' });
    await new Promise((resolve) => setImmediate(resolve));
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
