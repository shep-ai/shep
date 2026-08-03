/**
 * AdoptAgentSessionUseCase + SessionAdoptionSummarizer Unit Tests
 *
 * The priority path of spec 105. The critical assertions are that adoption
 * calls createRecord (never execute, which always creates a worktree) and that
 * the resulting feature has no branch and no agent run.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdoptAgentSessionUseCase,
  AgentSessionNotFoundError,
  AgentSessionProviderUnsupportedError,
} from '@/application/use-cases/agents/adopt-agent-session.use-case.js';
import { SessionAdoptionSummarizer } from '@/application/use-cases/agents/session-adoption-summarizer.js';
import { StructuredCallError } from '@/application/ports/output/agents/structured-call-error.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import type { IAgentSessionRepositoryRegistry } from '@/application/ports/output/agents/agent-session-repository-registry.interface.js';
import type { IAgentSessionRepository } from '@/application/ports/output/agents/agent-session-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { AgentSession, AgentType, Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';

const SESSION_ID = 'sess-abc';
const REPO_PATH = '/Users/dev/project';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: SESSION_ID,
    agentType: 'claude-code' as AgentType,
    projectPath: REPO_PATH,
    messageCount: 3,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-02T00:00:00Z'),
    preview: 'refactor the billing module',
    messages: [
      {
        uuid: 'm1',
        role: 'user',
        content: 'refactor the billing module to use the new tax service',
        timestamp: new Date('2026-08-01T00:00:00Z'),
      },
      {
        uuid: 'm2',
        role: 'assistant',
        content: 'I updated invoice.ts but the tests still fail',
        timestamp: new Date('2026-08-01T00:05:00Z'),
      },
    ],
    ...overrides,
  };
}

function makeFeature(): Feature {
  return {
    id: 'feat-1',
    name: 'Billing refactor',
    slug: 'billing-refactor',
    description: 'Refactor billing onto the tax service',
    userQuery: 'adopted',
    repositoryPath: REPO_PATH,
    branch: 'feature/billing-refactor',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
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
    createdAt: new Date('2026-08-03T00:00:00Z'),
    updatedAt: new Date('2026-08-03T00:00:00Z'),
  };
}

describe('SessionAdoptionSummarizer', () => {
  let caller: IStructuredAgentCaller;
  let summarizer: SessionAdoptionSummarizer;

  beforeEach(() => {
    caller = { call: vi.fn() };
    summarizer = new SessionAdoptionSummarizer(caller);
  });

  it('maps a successful structured call onto the summary', async () => {
    vi.mocked(caller.call).mockResolvedValue({
      slug: 'billing-refactor',
      name: 'Billing refactor',
      description: 'Move billing onto the tax service',
      remainingWork: 'Tests still fail',
    });

    const summary = await summarizer.summarize(makeSession());

    expect(summary.name).toBe('Billing refactor');
    expect(summary.description).toBe('Move billing onto the tax service');
    expect(summary.remainingWork).toBe('Tests still fail');
    expect(summary.derivedLocally).toBe(false);
  });

  it('falls back to deterministic extraction on StructuredCallError', async () => {
    vi.mocked(caller.call).mockRejectedValue(new StructuredCallError('bad json', 'parse_failed'));

    const summary = await summarizer.summarize(makeSession());

    expect(summary.derivedLocally).toBe(true);
    expect(summary.description).toContain('refactor the billing module');
    expect(summary.name).not.toBe('');
    expect(summary.slug).not.toBe('');
  });

  it('falls back when the model returns an incomplete object', async () => {
    vi.mocked(caller.call).mockResolvedValue({ slug: '', name: '', description: '' });

    const summary = await summarizer.summarize(makeSession());

    expect(summary.derivedLocally).toBe(true);
  });

  it('truncates a long transcript before calling the model', async () => {
    vi.mocked(caller.call).mockResolvedValue({
      slug: 's',
      name: 'n',
      description: 'd',
      remainingWork: 'r',
    });

    const huge = 'x'.repeat(50_000);
    await summarizer.summarize(
      makeSession({
        messages: Array.from({ length: 40 }, (_, i) => ({
          uuid: `m${i}`,
          role: 'user' as const,
          content: huge,
          timestamp: new Date(),
        })),
      })
    );

    const prompt = vi.mocked(caller.call).mock.calls[0][0];
    expect(prompt.length).toBeLessThan(20_000);
    expect(prompt).toContain('transcript truncated');
  });

  it('instructs the model not to copy secrets into the output', async () => {
    vi.mocked(caller.call).mockResolvedValue({
      slug: 's',
      name: 'n',
      description: 'd',
      remainingWork: 'r',
    });

    await summarizer.summarize(makeSession());

    expect(vi.mocked(caller.call).mock.calls[0][0]).toMatch(/secrets|tokens|credentials/i);
  });

  it('still produces a usable name for a transcript with no messages', async () => {
    vi.mocked(caller.call).mockRejectedValue(new Error('offline'));

    const summary = await summarizer.summarize(
      makeSession({ messages: [], preview: undefined, messageCount: 0 })
    );

    expect(summary.name).not.toBe('');
    expect(summary.slug).not.toBe('');
    expect(summary.derivedLocally).toBe(true);
  });
});

describe('AdoptAgentSessionUseCase', () => {
  let sessionRepo: IAgentSessionRepository;
  let registry: IAgentSessionRepositoryRegistry;
  let summarizer: SessionAdoptionSummarizer;
  let createFeature: CreateFeatureUseCase;
  let featureRepo: IFeatureRepository;
  let useCase: AdoptAgentSessionUseCase;

  beforeEach(() => {
    sessionRepo = {
      isSupported: vi.fn().mockReturnValue(true),
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(makeSession()),
    };
    registry = { getRepository: () => sessionRepo };

    summarizer = {
      summarize: vi.fn().mockResolvedValue({
        slug: 'billing-refactor',
        name: 'Billing refactor',
        description: 'Move billing onto the tax service',
        remainingWork: 'Tests still fail',
        derivedLocally: false,
      }),
    } as unknown as SessionAdoptionSummarizer;

    createFeature = {
      createRecord: vi.fn().mockResolvedValue({ feature: makeFeature(), shouldSpawn: false }),
      execute: vi.fn(),
      initializeAndSpawn: vi.fn(),
    } as unknown as CreateFeatureUseCase;

    featureRepo = { update: vi.fn().mockResolvedValue(undefined) } as unknown as IFeatureRepository;

    useCase = new AdoptAgentSessionUseCase(registry, summarizer, createFeature, featureRepo);
  });

  it('reads the full transcript through the session port', async () => {
    await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    expect(sessionRepo.findById).toHaveBeenCalledWith(SESSION_ID, { messageLimit: 0 });
  });

  it('creates the feature via createRecord and never via execute', async () => {
    await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    expect(createFeature.createRecord).toHaveBeenCalledTimes(1);
    // execute() runs initializeAndSpawn, which always creates a git worktree.
    expect(createFeature.execute).not.toHaveBeenCalled();
    expect(createFeature.initializeAndSpawn).not.toHaveBeenCalled();
  });

  it('passes the derived name and description so no second AI call happens', async () => {
    await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    expect(createFeature.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Billing refactor',
        description: 'Move billing onto the tax service',
        repositoryPath: REPO_PATH,
      })
    );
  });

  it('never requests pending mode, which would land in Pending not Requirements', async () => {
    await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    const input = vi.mocked(createFeature.createRecord).mock.calls[0][0];
    expect(input.pending).toBeUndefined();
  });

  it('returns a feature in the Requirements lifecycle', async () => {
    const result = await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
  });

  it('persists the originating session id and agent type', async () => {
    const result = await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    expect(result.feature.sourceAgentSessionId).toBe(SESSION_ID);
    expect(result.feature.sourceAgentType).toBe('claude-code');
    expect(featureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ sourceAgentSessionId: SESSION_ID })
    );
  });

  it('records the derived summary in the preserved user query', async () => {
    await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    const input = vi.mocked(createFeature.createRecord).mock.calls[0][0];
    expect(input.userInput).toContain('Move billing onto the tax service');
    expect(input.userInput).toContain('Tests still fail');
  });

  it('surfaces when metadata came from the deterministic fallback', async () => {
    vi.mocked(summarizer.summarize).mockResolvedValue({
      slug: 's',
      name: 'n',
      description: 'd',
      remainingWork: 'r',
      derivedLocally: true,
    });

    const result = await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'claude-code',
      repositoryPath: REPO_PATH,
    });

    expect(result.derivedLocally).toBe(true);
  });

  it('throws a typed error for an unknown session', async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ sessionId: 'nope', agentType: 'claude-code', repositoryPath: REPO_PATH })
    ).rejects.toThrow(AgentSessionNotFoundError);
    expect(createFeature.createRecord).not.toHaveBeenCalled();
  });

  it('throws a typed error for an unsupported provider', async () => {
    vi.mocked(sessionRepo.isSupported).mockReturnValue(false);

    await expect(
      useCase.execute({ sessionId: SESSION_ID, agentType: 'aider', repositoryPath: REPO_PATH })
    ).rejects.toThrow(AgentSessionProviderUnsupportedError);
    expect(sessionRepo.findById).not.toHaveBeenCalled();
  });

  it('adopts a Cursor session, not just Claude Code', async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(
      makeSession({ agentType: 'cursor' as AgentType })
    );

    const result = await useCase.execute({
      sessionId: SESSION_ID,
      agentType: 'cursor',
      repositoryPath: REPO_PATH,
    });

    expect(result.feature.sourceAgentType).toBe('cursor');
  });
});
