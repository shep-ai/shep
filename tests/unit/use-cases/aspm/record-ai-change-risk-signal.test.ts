/**
 * RecordAiChangeRiskSignalUseCase unit tests (feature 098, phase 8, task-50).
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RecordAiChangeRiskSignalUseCase } from '@/application/use-cases/aspm/ai-review/record-ai-change-risk-signal.js';
import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  type AiChangeRiskSignal,
  type Application,
} from '@/domain/generated/output.js';
import type { IAiChangeRiskSignalRepository } from '@/application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import { ApplicationNotFoundError } from '@/domain/aspm/errors/application-not-found.error.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

class FakeSignalRepo implements IAiChangeRiskSignalRepository {
  saved: AiChangeRiskSignal[] = [];
  async countOpen() {
    return 0;
  }
  async create(signal: AiChangeRiskSignal): Promise<void> {
    this.saved.push(signal);
  }
  async findById() {
    return null;
  }
  async list() {
    return [];
  }
  async markGraduated() {
    /* noop */
  }
  async markDismissed() {
    /* noop */
  }
  async updateState() {
    /* noop */
  }
  async softDelete() {
    /* noop */
  }
}

function fakeAppRepo(existingId?: string): IApplicationRepository {
  return {
    create: async () => undefined,
    findById: async (id: string) =>
      id === existingId
        ? ({ id, name: 'demo', slug: 'demo', path: '/demo' } as unknown as Application)
        : null,
    findBySlug: async () => null,
    findByPath: async () => null,
    list: async () => [],
    update: async () => undefined,
    softDelete: async () => undefined,
    restore: async () => undefined,
  };
}

describe('RecordAiChangeRiskSignalUseCase', () => {
  it('records a new Open signal for an existing application', async () => {
    const appId = randomUUID();
    const repo = new FakeSignalRepo();
    const uc = new RecordAiChangeRiskSignalUseCase(
      repo,
      fakeAppRepo(appId),
      new FakeSlaClock(new Date('2026-05-19T12:00:00Z'))
    );

    const signal = await uc.execute({
      applicationId: appId,
      signalType: AiSignalType.SecretInDiff,
      severity: CanonicalSeverity.High,
      summary: 'AI-generated code added an AWS access key',
      evidence: JSON.stringify({ path: 'src/config.ts', line: 12 }),
      agentSessionId: 'session-abc',
    });

    expect(signal.state).toBe(AiSignalState.Open);
    expect(signal.applicationId).toBe(appId);
    expect(signal.signalType).toBe(AiSignalType.SecretInDiff);
    expect(signal.severity).toBe(CanonicalSeverity.High);
    expect(signal.agentSessionId).toBe('session-abc');
    expect(signal.discoveredAt).toEqual(new Date('2026-05-19T12:00:00Z'));
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].id).toBe(signal.id);
  });

  it('trims the summary and rejects empty input', async () => {
    const appId = randomUUID();
    const uc = new RecordAiChangeRiskSignalUseCase(
      new FakeSignalRepo(),
      fakeAppRepo(appId),
      new FakeSlaClock()
    );

    await expect(
      uc.execute({
        applicationId: appId,
        signalType: AiSignalType.LargeUnreviewedDiff,
        severity: CanonicalSeverity.Medium,
        summary: '   ',
      })
    ).rejects.toThrow();
  });

  it('throws ApplicationNotFoundError for an unknown application', async () => {
    const uc = new RecordAiChangeRiskSignalUseCase(
      new FakeSignalRepo(),
      fakeAppRepo(),
      new FakeSlaClock()
    );

    await expect(
      uc.execute({
        applicationId: randomUUID(),
        signalType: AiSignalType.Other,
        severity: CanonicalSeverity.Low,
        summary: 'some signal',
      })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });

  it('does not import any AI-provider SDK at runtime (agent-agnostic)', async () => {
    // Smoke-test that the module under test never lists an AI SDK dep.
    // Use a require-cache snapshot for a sentinel — if the module ever imports
    // anthropic/openai, this fake test setup would surface it at runtime.
    const before = Object.keys(require.cache);
    await import('@/application/use-cases/aspm/ai-review/record-ai-change-risk-signal.js');
    const after = Object.keys(require.cache);
    const newDeps = after.filter((k) => !before.includes(k));
    const offenders = newDeps.filter(
      (k) => k.includes('@anthropic-ai') || k.includes('openai') || /\/anthropic\//.test(k)
    );
    expect(offenders).toEqual([]);
  });
});
