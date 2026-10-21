/**
 * FeatureAgentLifecyclePublisher — unit tests (spec 093, task 14).
 *
 * The publisher wraps SendAgentMessageUseCase so the feature-agent worker
 * can emit four lifecycle messages (started, phase-changed, blocked,
 * completed) without learning about message bus internals. The use case
 * itself owns the feature-flag gate; the publisher is a thin adapter.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureAgentLifecyclePublisher } from '@/infrastructure/services/agents/feature-agent/feature-agent-lifecycle-publisher.js';
import type { SendAgentMessageUseCase } from '@/application/use-cases/agents/send-agent-message.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import { createMockApplicationRepository } from '../../../../../helpers/application-repository.mock.js';
import type { Application } from '@/domain/generated/output.js';
import { AgentMessageKind } from '@/domain/generated/output.js';

function makeApplicationRepo(app: Application | null = null): IApplicationRepository {
  return createMockApplicationRepository({ findByPath: vi.fn().mockResolvedValue(app) });
}

function makeSendUseCase(): SendAgentMessageUseCase & { execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn().mockResolvedValue({ enabled: true, message: { id: 'm1' } });
  return { execute } as unknown as SendAgentMessageUseCase & {
    execute: typeof execute;
  };
}

describe('FeatureAgentLifecyclePublisher', () => {
  let send: ReturnType<typeof makeSendUseCase>;

  beforeEach(() => {
    send = makeSendUseCase();
  });

  it('publishes started/phase-changed/blocked/completed with the right kinds', async () => {
    const publisher = new FeatureAgentLifecyclePublisher(send, makeApplicationRepo());

    await publisher.publishStarted({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
    });
    await publisher.publishPhaseChanged({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
      phase: 'implementation',
    });
    await publisher.publishBlocked({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
      reason: 'awaiting approval',
    });
    await publisher.publishCompleted({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
    });

    expect(send.execute).toHaveBeenCalledTimes(4);

    const kinds = send.execute.mock.calls.map((c) => c[0].messageKind);
    expect(kinds).toEqual([
      AgentMessageKind.status,
      AgentMessageKind.status,
      AgentMessageKind.blocked,
      AgentMessageKind.status,
    ]);
  });

  it('uses application id when one is found at the repository path', async () => {
    const app = { id: 'app-77' } as Application;
    const publisher = new FeatureAgentLifecyclePublisher(send, makeApplicationRepo(app));

    await publisher.publishStarted({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo-with-app',
    });

    expect(send.execute).toHaveBeenCalledTimes(1);
    expect(send.execute.mock.calls[0]?.[0]?.appId).toBe('app-77');
    expect(send.execute.mock.calls[0]?.[0]?.featureId).toBe('feat-1');
    expect(send.execute.mock.calls[0]?.[0]?.fromActor).toBe('agent:run-1');
    expect(send.execute.mock.calls[0]?.[0]?.fromAgentRunId).toBe('run-1');
    expect(send.execute.mock.calls[0]?.[0]?.toKind).toBe('broadcast');
  });

  it('falls back to repositoryPath as appId when no Application is registered', async () => {
    const publisher = new FeatureAgentLifecyclePublisher(send, makeApplicationRepo(null));

    await publisher.publishStarted({
      runId: 'run-2',
      featureId: 'feat-2',
      repositoryPath: '/tmp/no-app-here',
    });

    expect(send.execute.mock.calls[0]?.[0]?.appId).toBe('/tmp/no-app-here');
  });

  it('swallows publish failures so a bus outage cannot crash the worker', async () => {
    send.execute.mockRejectedValueOnce(new Error('boom'));
    const publisher = new FeatureAgentLifecyclePublisher(send, makeApplicationRepo());

    await expect(
      publisher.publishStarted({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/tmp/repo',
      })
    ).resolves.toBeUndefined();
  });

  it('forwards a structured payload that includes phase + reason where applicable', async () => {
    const publisher = new FeatureAgentLifecyclePublisher(send, makeApplicationRepo());

    await publisher.publishPhaseChanged({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
      phase: 'requirements',
    });
    await publisher.publishBlocked({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
      reason: 'waiting_approval:plan',
    });

    const phasePayload = send.execute.mock.calls[0]?.[0]?.payload;
    const blockedPayload = send.execute.mock.calls[1]?.[0]?.payload;
    expect(phasePayload).toMatchObject({ event: 'phase-changed', phase: 'requirements' });
    expect(blockedPayload).toMatchObject({ event: 'blocked', reason: 'waiting_approval:plan' });
  });
});
