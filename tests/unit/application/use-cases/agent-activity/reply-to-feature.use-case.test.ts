/**
 * ReplyToFeatureUseCase (spec 148): one way for any caller to act on a feature
 * that waits — decide its gate, answer its agent's question, or stop it —
 * through the use cases the console and inbox already use.
 * TDD: RED-GREEN-REFACTOR.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ReplyToFeatureUseCase } from '@/application/use-cases/agent-activity/reply-to-feature.use-case.js';
import type { AgentActivity } from '@/application/use-cases/agent-activity/agent-activity.types.js';
import {
  AgentActivityState,
  AgentQuestionStatus,
  DecisionSurface,
  FeatureConsoleAction,
  FeatureReplyOutcome,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';

function activity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    featureId: 'feature-1',
    shortId: 'feature-',
    name: 'Login page',
    repositoryPath: '/work/acme',
    branch: 'feat/login',
    state: AgentActivityState.Blocked,
    reason: FeatureStateReason.ApprovalGate,
    featureState: FeatureState.ActionRequired,
    lifecycle: SdlcLifecycle.Planning,
    phase: 'plan',
    pendingQuestions: 0,
    actions: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
    version: 1,
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('ReplyToFeatureUseCase', () => {
  let activities: AgentActivity[];
  let getActivity: { execute: ReturnType<typeof vi.fn> };
  let consoleAction: { execute: ReturnType<typeof vi.fn> };
  let answerQuestion: { execute: ReturnType<typeof vi.fn> };
  let applications: { findByPath: ReturnType<typeof vi.fn> };
  let useCase: ReplyToFeatureUseCase;

  beforeEach(() => {
    activities = [activity()];
    getActivity = {
      execute: vi.fn(async () => ({ activities, notFound: activities.length === 0 })),
    };
    consoleAction = { execute: vi.fn(async () => ({ ok: true, message: 'Approved Login page' })) };
    answerQuestion = { execute: vi.fn(async () => ({ enabled: true, forwardedToGate: false })) };
    applications = { findByPath: vi.fn(async () => null) };
    useCase = new ReplyToFeatureUseCase(
      getActivity as never,
      consoleAction as never,
      answerQuestion as never,
      applications as never
    );
  });

  const base = { featureId: 'feature-1', answeredBy: 'a2a', surface: DecisionSurface.Other };

  it('decides a gate through the console action use case, by full id', async () => {
    const result = await useCase.execute({
      ...base,
      featureId: 'feat',
      action: FeatureConsoleAction.Reject,
      feedback: 'Split the migration',
    });

    expect(consoleAction.execute).toHaveBeenCalledWith({
      featureId: 'feature-1',
      action: FeatureConsoleAction.Reject,
      feedback: 'Split the migration',
    });
    expect(result.outcome).toBe(FeatureReplyOutcome.Applied);
    expect(result.activity?.featureId).toBe('feature-1');
  });

  it('passes on a refusal from the console action use case', async () => {
    consoleAction.execute.mockResolvedValue({
      ok: false,
      message: 'Login page cannot be approved right now.',
    });

    const result = await useCase.execute({ ...base, action: FeatureConsoleAction.Approve });

    expect(result).toMatchObject({
      outcome: FeatureReplyOutcome.Refused,
      message: 'Login page cannot be approved right now.',
    });
  });

  it('refuses a rejection without feedback', async () => {
    const result = await useCase.execute({ ...base, action: FeatureConsoleAction.Reject });

    expect(result.outcome).toBe(FeatureReplyOutcome.Refused);
    expect(consoleAction.execute).not.toHaveBeenCalled();
  });

  it('answers the open agent question with the text', async () => {
    activities = [
      activity({
        reason: FeatureStateReason.AgentQuestion,
        pendingQuestions: 1,
        pendingQuestion: { id: 'q1', appId: 'app-1', prompt: 'Which database?' },
      }),
    ];

    const result = await useCase.execute({ ...base, answer: 'Postgres' });

    expect(answerQuestion.execute).toHaveBeenCalledWith({
      appId: 'app-1',
      questionId: 'q1',
      answer: 'Postgres',
      answeredBy: 'a2a',
      surface: DecisionSurface.Other,
    });
    expect(result.outcome).toBe(FeatureReplyOutcome.Applied);
  });

  it('files the answer under the repository scope when the question names none', async () => {
    activities = [activity({ pendingQuestion: { id: 'q1', prompt: '?' }, pendingQuestions: 1 })];

    await useCase.execute({ ...base, answer: 'yes' });

    expect(answerQuestion.execute).toHaveBeenCalledWith(
      expect.objectContaining({ appId: '/work/acme' })
    );
  });

  it('says why an answer was not applied', async () => {
    activities = [activity({ pendingQuestion: { id: 'q1', appId: 'a', prompt: '?' } })];

    answerQuestion.execute.mockResolvedValueOnce({ enabled: false, forwardedToGate: false });
    expect((await useCase.execute({ ...base, answer: 'x' })).outcome).toBe(
      FeatureReplyOutcome.Refused
    );

    answerQuestion.execute.mockResolvedValueOnce({
      enabled: true,
      forwardedToGate: false,
      alreadySettledAs: AgentQuestionStatus.answered,
    });
    const settled = await useCase.execute({ ...base, answer: 'x' });
    expect(settled.outcome).toBe(FeatureReplyOutcome.Refused);
    expect(settled.message).toMatch(/answered/);
  });

  it('refuses an answer when nothing is asked, and a reply with nothing in it', async () => {
    expect((await useCase.execute({ ...base, answer: 'hello' })).outcome).toBe(
      FeatureReplyOutcome.Refused
    );
    expect((await useCase.execute(base)).outcome).toBe(FeatureReplyOutcome.Refused);
    expect(answerQuestion.execute).not.toHaveBeenCalled();
  });

  it('reports a missing feature and an ambiguous prefix', async () => {
    activities = [];
    expect((await useCase.execute({ ...base, answer: 'x' })).outcome).toBe(
      FeatureReplyOutcome.NotFound
    );

    activities = [activity(), activity({ featureId: 'feature-2' })];
    expect((await useCase.execute({ ...base, answer: 'x' })).outcome).toBe(
      FeatureReplyOutcome.Ambiguous
    );
  });

  it('never throws', async () => {
    consoleAction.execute.mockRejectedValue(new Error('database is locked'));

    const result = await useCase.execute({ ...base, action: FeatureConsoleAction.Stop });

    expect(result).toMatchObject({
      outcome: FeatureReplyOutcome.Refused,
      message: 'database is locked',
    });
  });
});
