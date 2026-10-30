import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ReflectOnFeatureUseCase } from '@/application/use-cases/harness-learning/reflect-on-feature.use-case.js';
import {
  AgentType,
  CiStatus,
  PrStatus,
  SdlcLifecycle,
  type Feature,
} from '@/domain/generated/output.js';

const FEATURE = {
  id: 'feat-123456',
  name: 'Audit log',
  repositoryPath: '/repos/app',
  worktreePath: '/wt/feat-1',
  agentRunId: 'run-1',
  lifecycle: SdlcLifecycle.Review,
  pr: {
    url: 'u',
    number: 1,
    status: PrStatus.Merged,
    ciStatus: CiStatus.Success,
    ciFixAttempts: 2,
    ciFixHistory: [],
  },
} as unknown as Feature;

function build(
  feature: Feature | null = FEATURE,
  agentType: AgentType | null = AgentType.CodexCli
) {
  const features = {
    findById: vi.fn(async (id: string) => (feature && id === feature.id ? feature : null)),
    findByIdPrefix: vi.fn(async (p: string) => (feature?.id.startsWith(p) ? feature : null)),
  };
  const runs = {
    findById: vi.fn(async () => (agentType ? { id: 'run-1', agentType } : null)),
  };
  const reflect = {
    execute: vi.fn(async () => ({ skipped: false, costUsd: 1, candidateVersionId: 'v9' })),
  };
  const useCase = new ReflectOnFeatureUseCase(features as never, runs as never, reflect as never);
  return { useCase, features, runs, reflect };
}

describe('ReflectOnFeatureUseCase', () => {
  it('reflects on a feature found by id prefix, as a manual request with its stored signals', async () => {
    const t = build();
    const result = await t.useCase.execute({ featureId: 'feat-12' });

    expect(result).toMatchObject({ skipped: false, candidateVersionId: 'v9' });
    expect(t.reflect.execute).toHaveBeenCalledWith(
      {
        featureId: 'feat-123456',
        repositoryPath: '/repos/app',
        worktreePath: '/wt/feat-1',
        agentType: AgentType.CodexCli,
        manual: true,
        signals: {
          merged: true,
          ciStatus: CiStatus.Success,
          ciFixAttempts: 2,
          ciFixHistory: [],
          rejectionFeedback: [],
          validationRepairs: 0,
          lastValidationErrors: [],
          error: null,
        },
      },
      'run-1'
    );
  });

  it('skips with a reason when the feature or its agent run cannot be found', async () => {
    expect(await build(null).useCase.execute({ featureId: 'nope' })).toMatchObject({
      skipped: true,
      reason: expect.stringContaining('not found'),
    });
    const noRun = build(FEATURE, null);
    expect(await noRun.useCase.execute({ featureId: FEATURE.id })).toMatchObject({
      skipped: true,
      reason: expect.stringContaining('agent run'),
    });
    expect(noRun.reflect.execute).not.toHaveBeenCalled();
  });
});
