/**
 * AgentQuestionExecutorBridge — spec 093 task 19, wired by spec 134.
 *
 * Real Ask/Answer/Cancel use cases over the in-memory repository and the
 * deferred registry. The bridge records a chat AskUserQuestion as a Live
 * decision so the inbox and notifications see it, shows it in the chat through
 * the live surface, and settles whichever side did not answer.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  AgentQuestionExecutorBridge,
  type LiveQuestionSurface,
} from '@/infrastructure/services/agents/agent-question-service/agent-question-executor-bridge.js';
import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { CancelAgentQuestionUseCase } from '@/application/use-cases/agents/cancel-agent-question.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { DeferredQuestionRegistry } from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import type { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import type { UserInteractionData } from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import {
  AgentQuestionKind,
  AgentQuestionStatus,
  DecisionKind,
  DecisionResponseMode,
  type Settings,
} from '@/domain/generated/output.js';

function makeSettingsRepo(collaboration: boolean): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ featureFlags: { collaboration } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

const noopApprove = {
  execute: vi.fn().mockResolvedValue({ approved: true, reason: 'ok' }),
} as unknown as ApproveAgentRunUseCase;
const noopReject = {
  execute: vi.fn().mockResolvedValue({ rejected: true, reason: 'ok' }),
} as unknown as RejectAgentRunUseCase;
const noopAgentRunRepo = {
  findById: vi.fn().mockResolvedValue(null),
} as unknown as IAgentRunRepository;

const INTERACTION: UserInteractionData = {
  toolCallId: 'tu_1',
  questions: [
    {
      question: 'Which store?',
      header: 'Store',
      multiSelect: false,
      options: [
        { label: 'Redis', description: 'Shared' },
        { label: 'Memory', description: 'Per process', preview: 'Map<string, Session>' },
      ],
    },
  ],
};

/** A chat surface the test controls: it records what was shown and can be answered. */
function makeSurface() {
  let answerChat: (answers: Record<string, string>) => void = () => undefined;
  const surface: LiveQuestionSurface = {
    ask: vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          answerChat = resolve;
        })
    ),
    settleFromElsewhere: vi.fn(async (answers: Record<string, string>) => {
      answerChat(answers);
    }),
  };
  return { surface, answerFromChat: (a: Record<string, string>) => answerChat(a) };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('AgentQuestionExecutorBridge', () => {
  let repo: InMemoryAgentQuestionRepository;
  let registry: DeferredQuestionRegistry;

  beforeEach(() => {
    repo = new InMemoryAgentQuestionRepository();
    registry = new DeferredQuestionRegistry();
  });

  function build(collaboration: boolean, surface?: LiveQuestionSurface) {
    const settings = makeSettingsRepo(collaboration);
    const ask = new AskAgentQuestionUseCase(
      repo,
      registry,
      settings,
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
    );
    const answer = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      noopAgentRunRepo,
      noopApprove,
      noopReject
    );
    const cancel = new CancelAgentQuestionUseCase(repo, registry, settings);
    const bridge = new AgentQuestionExecutorBridge(
      { ask, answer, cancel, questions: repo },
      { appId: 'app-1', featureId: 'feat-1', agentRunId: 'session-1' },
      surface
    );
    return { bridge, answer };
  }

  it('records the question as a Live chat decision with option previews', async () => {
    const { surface } = makeSurface();
    const { bridge } = build(true, surface);

    void bridge.ask(INTERACTION);
    await flush();

    const [stored] = await repo.listByScope('app-1', undefined);
    expect(stored.kind).toBe(AgentQuestionKind.blocking);
    expect(stored.prompt).toBe('Which store?');
    expect(stored.decision?.kind).toBe(DecisionKind.ChatQuestion);
    expect(stored.decision?.responseMode).toBe(DecisionResponseMode.Live);
    expect(stored.decision?.questions[0].options[1].preview).toBe('Map<string, Session>');
    expect(surface.ask).toHaveBeenCalledWith(INTERACTION);
  });

  it('a chat answer is returned to the agent and settles the inbox row', async () => {
    const { surface, answerFromChat } = makeSurface();
    const { bridge } = build(true, surface);

    const pending = bridge.ask(INTERACTION);
    await flush();
    answerFromChat({ 'Which store?': 'Memory' });

    await expect(pending).resolves.toEqual({ 'Which store?': 'Memory' });
    const [stored] = await repo.listByScope('app-1', undefined);
    expect(stored.status).toBe(AgentQuestionStatus.answered);
    expect(stored.responses).toEqual([{ questionId: 'q1', optionIds: ['o2'] }]);
    expect(stored.answeredBy).toBe('user:chat');
  });

  it('an inbox answer is returned to the agent and closes the chat question', async () => {
    const { surface } = makeSurface();
    const { bridge, answer } = build(true, surface);

    const pending = bridge.ask(INTERACTION);
    await flush();
    const [stored] = await repo.listByScope('app-1', undefined);
    await answer.execute({
      appId: 'app-1',
      questionId: stored.id,
      responses: [{ questionId: 'q1', optionIds: [], customText: 'Postgres' }],
      answeredBy: 'user:web',
    });

    await expect(pending).resolves.toEqual({ 'Which store?': 'Postgres' });
    expect(surface.settleFromElsewhere).toHaveBeenCalledWith({ 'Which store?': 'Postgres' });
  });

  it('without a live surface it waits for the inbox only', async () => {
    const { bridge, answer } = build(true);

    const pending = bridge.ask(INTERACTION);
    await flush();
    const [stored] = await repo.listByScope('app-1', undefined);
    await answer.execute({
      appId: 'app-1',
      questionId: stored.id,
      answer: 'redis',
      answeredBy: 'user:cli',
    });

    await expect(pending).resolves.toEqual({ 'Which store?': 'Redis' });
  });

  it('when the inbox side is cancelled the chat can still answer', async () => {
    const { surface, answerFromChat } = makeSurface();
    const { bridge } = build(true, surface);

    const pending = bridge.ask(INTERACTION);
    await flush();
    const [stored] = await repo.listByScope('app-1', undefined);
    registry.reject(stored.id, 'worker stopped');
    await flush();
    answerFromChat({ 'Which store?': 'Redis' });

    await expect(pending).resolves.toEqual({ 'Which store?': 'Redis' });
  });

  it('returns null with the collaboration flag off so the executor keeps its own path', async () => {
    const { surface } = makeSurface();
    const { bridge } = build(false, surface);

    await expect(bridge.ask(INTERACTION)).resolves.toBeNull();
    expect(surface.ask).not.toHaveBeenCalled();
    expect(await repo.listByScope('app-1', undefined)).toHaveLength(0);
  });
});
