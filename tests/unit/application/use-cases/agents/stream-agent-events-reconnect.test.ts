/**
 * StreamAgentEventsUseCase — reconnect behaviour (spec 116, tasks 10 + 11).
 *
 * Every SSE (re)connect runs a fresh `execute()` with fresh caches. Rows that
 * already existed when the connection opened are history the client has
 * already been told about (or loads through its own fetch path), so a
 * reconnect must not replay them as `new`:
 *
 *   1. messages / decisions / settled questions existing at connect → no
 *      events; a question still PENDING at connect is open state and is sent
 *      once as a snapshot (the client upserts by id)
 *   2. a row added after connect → exactly one event
 *   3. an application that appears after connect streams its rows from start
 *   4. the poll loop does not accumulate `abort` listeners on the caller's
 *      signal (one per 2s tick leaked before)
 */

import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StreamAgentEventsUseCase } from '@/application/use-cases/agents/stream-agent-events.use-case.js';
import type { StreamedAgentEvent } from '@/application/use-cases/agents/stream-agent-events.use-case.js';
import type { ListFeaturesUseCase } from '@/application/use-cases/features/list-features.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ICloudDeploymentEventBus } from '@/application/ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { IOperationLogEventBus } from '@/application/ports/output/services/operation-log-event-bus.interface.js';
import type { IProcessLivenessProbe } from '@/application/ports/output/services/process-liveness.interface.js';
import { InMemoryAgentMessageBus } from '@/infrastructure/adapters/in-memory/in-memory-agent-message-bus.js';
import { InMemoryAgentMessageRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-message-repository.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { InMemorySupervisorDecisionRepository } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-decision-repository.js';

import type {
  AgentMessage,
  AgentQuestion,
  Application,
  SupervisorDecision,
} from '@/domain/generated/output.js';
import {
  AgentMessageKind,
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  ApplicationStatus,
  SupervisorVerdict,
} from '@/domain/generated/output.js';

const POLL_MS = 2;
const APP_ID = 'app-1';
const HISTORIC = new Date('2026-04-01T10:00:00Z');
const COLLABORATION_KINDS = new Set(['agent_message', 'agent_question', 'supervisor_decision']);

function makeApp(id: string): Application {
  return {
    id,
    name: id,
    slug: id,
    description: 'desc',
    repositoryPath: `/tmp/${id}`,
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: false,
    bedrockEnabled: false,
    createdAt: HISTORIC,
    updatedAt: HISTORIC,
    deletedAt: null,
  } as unknown as Application;
}

function makeMessage(id: string, appId = APP_ID, createdAt = HISTORIC): AgentMessage {
  return {
    id,
    appId,
    fromAgentRunId: 'run-1',
    fromActor: 'agent:run-1',
    toTarget: 'broadcast',
    toKind: 'broadcast',
    messageKind: AgentMessageKind.status,
    payload: '{}',
    createdAt,
    updatedAt: createdAt,
  } as AgentMessage;
}

function makeQuestion(
  id: string,
  appId = APP_ID,
  createdAt = HISTORIC,
  status = AgentQuestionStatus.pending
): AgentQuestion {
  return {
    id,
    appId,
    agentRunId: 'run-1',
    kind: AgentQuestionKind.question,
    prompt: '?',
    answerer: AgentQuestionAnswerer.user,
    status,
    createdAt,
    updatedAt: createdAt,
  } as AgentQuestion;
}

function makeDecision(id: string, appId = APP_ID, createdAt = HISTORIC): SupervisorDecision {
  return {
    id,
    scopeType: 'app',
    scopeId: appId,
    supervisorRunId: 'sup-1',
    sourceEventKind: 'gate',
    sourceEventId: 'gate-1',
    verdict: SupervisorVerdict.advise,
    rationale: 'ok',
    modelId: 'stub',
    promptVersion: 'v1',
    createdAt,
    updatedAt: createdAt,
  } as SupervisorDecision;
}

function build(apps: Application[]) {
  const listApplications = vi.fn(async () => [...apps]);
  const listFeatures = vi.fn().mockResolvedValue([]);
  const messageBus = new InMemoryAgentMessageBus(new InMemoryAgentMessageRepository());
  const listFor = vi.spyOn(messageBus, 'listFor');
  const questions = new InMemoryAgentQuestionRepository();
  const decisions = new InMemorySupervisorDecisionRepository();

  const useCase = new StreamAgentEventsUseCase(
    { execute: listFeatures } as unknown as ListFeaturesUseCase,
    { findByIds: vi.fn().mockResolvedValue([]) } as unknown as IAgentRunRepository,
    {
      findByRunId: vi.fn().mockResolvedValue([]),
      findByRunIds: vi.fn().mockResolvedValue([]),
    } as unknown as IPhaseTimingRepository,
    {
      findAllActive: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as IInteractiveSessionRepository,
    { isProcessAlive: vi.fn().mockReturnValue(true) } as IProcessLivenessProbe,
    { publish: vi.fn(), subscribe: vi.fn(() => () => undefined) } as ICloudDeploymentEventBus,
    { list: listApplications } as unknown as IApplicationRepository,
    { publish: vi.fn(), subscribe: vi.fn(() => () => undefined) } as IOperationLogEventBus,
    { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as ILogger,
    messageBus,
    questions,
    decisions
  );

  return { useCase, apps, messageBus, listFor, questions, decisions, listFeatures };
}

/** Consume the generator in the background; the caller aborts when done. */
function start(useCase: StreamAgentEventsUseCase, signal: AbortSignal) {
  const events: StreamedAgentEvent[] = [];
  const done = (async () => {
    for await (const event of useCase.execute({ signal, pollIntervalMs: POLL_MS })) {
      events.push(event);
    }
  })();
  return { events, done };
}

function collaboration(events: StreamedAgentEvent[]): StreamedAgentEvent[] {
  return events.filter((e) => COLLABORATION_KINDS.has(e.kind));
}

/** Wait until the loop has completed at least `n` more poll ticks. */
async function waitTicks(listFeatures: ReturnType<typeof vi.fn>, n: number): Promise<void> {
  const target = listFeatures.mock.calls.length + n;
  await vi.waitFor(() => expect(listFeatures.mock.calls.length).toBeGreaterThanOrEqual(target));
}

describe('StreamAgentEventsUseCase — reconnect does not replay history', () => {
  const controllers: AbortController[] = [];
  afterEach(() => {
    for (const c of controllers.splice(0)) c.abort();
  });

  function connect(useCase: StreamAgentEventsUseCase) {
    const controller = new AbortController();
    controllers.push(controller);
    return { controller, ...start(useCase, controller.signal) };
  }

  it('emits no event for messages, settled questions or decisions that existed at connect', async () => {
    const h = build([makeApp(APP_ID)]);
    await h.messageBus.publish(makeMessage('m-old'));
    await h.questions.create(makeQuestion('q-old', APP_ID, HISTORIC, AgentQuestionStatus.answered));
    await h.decisions.create(makeDecision('d-old'));

    const conn = connect(h.useCase);
    await waitTicks(h.listFeatures, 3);

    expect(collaboration(conn.events)).toEqual([]);
  });

  it('emits exactly one event for each row added after connect', async () => {
    const h = build([makeApp(APP_ID)]);
    await h.messageBus.publish(makeMessage('m-old'));
    await h.questions.create(makeQuestion('q-old', APP_ID, HISTORIC, AgentQuestionStatus.answered));
    await h.decisions.create(makeDecision('d-old'));

    const conn = connect(h.useCase);
    await waitTicks(h.listFeatures, 2);

    const now = new Date();
    await h.messageBus.publish(makeMessage('m-new', APP_ID, now));
    await h.questions.create(makeQuestion('q-new', APP_ID, now));
    await h.decisions.create(makeDecision('d-new', APP_ID, now));
    await waitTicks(h.listFeatures, 3);

    const ids = collaboration(conn.events).map((e) =>
      e.kind === 'agent_message'
        ? e.messageId
        : e.kind === 'agent_question'
          ? e.questionId
          : e.kind === 'supervisor_decision'
            ? e.decisionId
            : ''
    );
    expect(ids.sort()).toEqual(['d-new', 'm-new', 'q-new']);
  });

  it('still emits a status transition of a question that existed at connect', async () => {
    const h = build([makeApp(APP_ID)]);
    await h.questions.create(makeQuestion('q-old'));

    const conn = connect(h.useCase);
    await waitTicks(h.listFeatures, 2);
    await h.questions.updateStatus(APP_ID, 'q-old', AgentQuestionStatus.answered);
    await waitTicks(h.listFeatures, 2);

    const events = collaboration(conn.events);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ questionId: 'q-old', status: AgentQuestionStatus.pending });
    expect(events[1]).toMatchObject({
      kind: 'agent_question',
      questionId: 'q-old',
      transition: 'status',
      status: AgentQuestionStatus.answered,
    });
  });

  it('sends each question still pending at connect exactly once, and no settled one', async () => {
    const h = build([makeApp(APP_ID)]);
    await h.questions.create(makeQuestion('q-open'));
    await h.questions.create(
      makeQuestion('q-done', APP_ID, HISTORIC, AgentQuestionStatus.answered)
    );

    const conn = connect(h.useCase);
    await waitTicks(h.listFeatures, 3);

    const events = collaboration(conn.events);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'agent_question',
      questionId: 'q-open',
      status: AgentQuestionStatus.pending,
    });
  });

  it('streams the rows of an application created after connect', async () => {
    const h = build([makeApp(APP_ID)]);
    const conn = connect(h.useCase);
    await waitTicks(h.listFeatures, 2);

    // The app and its first message land between two polls.
    h.apps.push(makeApp('app-2'));
    await h.messageBus.publish(makeMessage('m-app2', 'app-2', new Date()));
    await waitTicks(h.listFeatures, 2);

    const events = collaboration(conn.events);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'agent_message', messageId: 'm-app2' });
  });

  it('does not replay history when the first fetch for a scope failed', async () => {
    const h = build([makeApp(APP_ID)]);
    await h.messageBus.publish(makeMessage('m-old'));
    h.listFor.mockRejectedValueOnce(new Error('db busy'));

    const conn = connect(h.useCase);
    await waitTicks(h.listFeatures, 3);

    expect(collaboration(conn.events)).toEqual([]);
  });
});

describe('StreamAgentEventsUseCase — poll loop abort listeners', () => {
  it('keeps at most one abort listener on the signal across many ticks', async () => {
    const h = build([]);
    const controller = new AbortController();
    const { signal } = controller;
    let active = 0;
    let peak = 0;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    vi.spyOn(signal, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'abort') peak = Math.max(peak, ++active);
      add(type, listener, options);
    });
    vi.spyOn(signal, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (type === 'abort') active--;
      remove(type, listener, options);
    });

    const conn = start(h.useCase, signal);
    await waitTicks(h.listFeatures, 10);

    // Each wait registers one listener; it must be released when the timer fires.
    expect(active).toBeLessThanOrEqual(1);
    expect(peak).toBeLessThanOrEqual(1);

    controller.abort();
    await conn.done;
  });
});
