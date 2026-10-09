/**
 * AgentQuestionBridgeFactory (spec 134) — scopes a chat session's questions
 * the way the inbox reads them: by Application when one owns the repository,
 * else by repository path.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { AgentQuestionBridgeFactory } from '@/infrastructure/services/agents/agent-question-service/agent-question-bridge.factory.js';
import { AgentQuestionExecutorBridge } from '@/infrastructure/services/agents/agent-question-service/agent-question-executor-bridge.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import { featureIdForApplication } from '@/domain/shared/feature-id.js';

function build(feature: { repositoryPath: string } | null, appByPath: { id: string } | null) {
  const features = {
    findById: vi.fn().mockResolvedValue(feature),
  } as unknown as IFeatureRepository;
  const applications = {
    findByPath: vi.fn().mockResolvedValue(appByPath),
  } as unknown as IApplicationRepository;
  const factory = new AgentQuestionBridgeFactory(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    features,
    applications
  );
  return { factory, applications };
}

const surface = { ask: vi.fn(), settleFromElsewhere: vi.fn() };

function scopeOf(bridge: unknown) {
  return (bridge as { scope: unknown }).scope;
}

describe('AgentQuestionBridgeFactory', () => {
  it('scopes an application chat to its application', async () => {
    const { factory } = build(null, null);
    const bridge = await factory.create(
      { scopeKey: featureIdForApplication('app-9'), worktreePath: '/wt', sessionId: 's1' },
      surface
    );
    expect(bridge).toBeInstanceOf(AgentQuestionExecutorBridge);
    expect(scopeOf(bridge)).toEqual({ appId: 'app-9', agentRunId: 's1' });
  });

  it('scopes a feature chat to the application that owns its repository', async () => {
    const { factory, applications } = build({ repositoryPath: '/repo' }, { id: 'app-1' });
    const bridge = await factory.create(
      { scopeKey: 'feat-1', worktreePath: '/wt', sessionId: 's1' },
      surface
    );
    expect(applications.findByPath).toHaveBeenCalledWith('/repo');
    expect(scopeOf(bridge)).toEqual({ appId: 'app-1', featureId: 'feat-1', agentRunId: 's1' });
  });

  it('falls back to the repository path when no application owns it', async () => {
    const { factory } = build({ repositoryPath: 'C:\\repos\\api' }, null);
    const bridge = await factory.create(
      { scopeKey: 'feat-1', worktreePath: '/wt', sessionId: 's1' },
      surface
    );
    expect(scopeOf(bridge)).toEqual({
      appId: 'C:/repos/api',
      featureId: 'feat-1',
      agentRunId: 's1',
    });
  });

  it('scopes a repository or global chat by its working directory', async () => {
    const { factory } = build(null, null);
    const bridge = await factory.create(
      { scopeKey: 'global', worktreePath: '/home/me/repo', sessionId: 's1' },
      surface
    );
    expect(scopeOf(bridge)).toEqual({ appId: '/home/me/repo', agentRunId: 's1' });
  });
});
