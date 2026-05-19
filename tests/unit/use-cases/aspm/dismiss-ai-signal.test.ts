/**
 * DismissAiSignalUseCase unit tests (feature 098, phase 8, task-50).
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DismissAiSignalUseCase } from '@/application/use-cases/aspm/ai-review/dismiss-ai-signal.js';
import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  type AiChangeRiskSignal,
} from '@/domain/generated/output.js';
import type { IAiChangeRiskSignalRepository } from '@/application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import { AiSignalNotFoundError } from '@/domain/aspm/errors/ai-signal-not-found.error.js';
import { AiSignalAlreadyGraduatedError } from '@/domain/aspm/errors/ai-signal-already-graduated.error.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

function makeSignal(overrides: Partial<AiChangeRiskSignal> = {}): AiChangeRiskSignal {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: randomUUID(),
    applicationId: randomUUID(),
    signalType: AiSignalType.LargeUnreviewedDiff,
    severity: CanonicalSeverity.Medium,
    summary: 'Diff is suspiciously large',
    evidence: JSON.stringify({ diffSize: 5200 }),
    state: AiSignalState.Open,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeSignalRepo implements IAiChangeRiskSignalRepository {
  dismissed: { id: string; evidence?: string; at: Date }[] = [];
  constructor(private readonly signal: AiChangeRiskSignal | null) {}
  async countOpen() {
    return 0;
  }
  async create() {
    return undefined;
  }
  async findById() {
    return this.signal;
  }
  async list() {
    return [];
  }
  async markGraduated() {
    return undefined;
  }
  async markDismissed(id: string, evidence: string | undefined, at: Date): Promise<void> {
    this.dismissed.push({ id, evidence, at });
  }
  async updateState() {
    return undefined;
  }
  async softDelete() {
    return undefined;
  }
}

describe('DismissAiSignalUseCase', () => {
  it('marks the signal as dismissed and records the justification in evidence', async () => {
    const signal = makeSignal();
    const repo = new FakeSignalRepo(signal);
    const uc = new DismissAiSignalUseCase(repo, new FakeSlaClock(new Date('2026-05-20T10:00:00Z')));

    const result = await uc.execute({
      signalId: signal.id,
      actor: 'alice',
      justification: 'Test fixture only',
    });

    expect(result.state).toBe(AiSignalState.Dismissed);
    expect(repo.dismissed).toHaveLength(1);
    expect(repo.dismissed[0].id).toBe(signal.id);
    const evidence = JSON.parse(repo.dismissed[0].evidence ?? '{}') as {
      original?: unknown;
      dismissals: { actor: string; justification: string }[];
    };
    expect(evidence.dismissals).toHaveLength(1);
    expect(evidence.dismissals[0].actor).toBe('alice');
    expect(evidence.dismissals[0].justification).toBe('Test fixture only');
  });

  it('preserves the original evidence inside the envelope', async () => {
    const signal = makeSignal({ evidence: JSON.stringify({ diffSize: 5200 }) });
    const repo = new FakeSignalRepo(signal);
    const uc = new DismissAiSignalUseCase(repo, new FakeSlaClock());

    await uc.execute({
      signalId: signal.id,
      actor: 'bob',
      justification: 'expected refactor',
    });

    const evidence = JSON.parse(repo.dismissed[0].evidence ?? '{}') as {
      original: unknown;
      dismissals: unknown[];
    };
    // The use case preserves the original payload — either wrapped directly
    // (when not yet in envelope form) or untouched (when already an envelope).
    expect(JSON.stringify(evidence)).toContain('5200');
  });

  it('rejects empty justification', async () => {
    const signal = makeSignal();
    const uc = new DismissAiSignalUseCase(new FakeSignalRepo(signal), new FakeSlaClock());
    await expect(
      uc.execute({ signalId: signal.id, actor: 'alice', justification: '   ' })
    ).rejects.toThrow();
  });

  it('throws AiSignalNotFoundError for missing signal', async () => {
    const uc = new DismissAiSignalUseCase(new FakeSignalRepo(null), new FakeSlaClock());
    await expect(
      uc.execute({ signalId: 'missing', actor: 'a', justification: 'b' })
    ).rejects.toBeInstanceOf(AiSignalNotFoundError);
  });

  it('throws AiSignalAlreadyGraduatedError when graduated/dismissed/resolved', async () => {
    for (const state of [
      AiSignalState.GraduatedToFinding,
      AiSignalState.Dismissed,
      AiSignalState.Resolved,
    ]) {
      const signal = makeSignal({ state });
      const uc = new DismissAiSignalUseCase(new FakeSignalRepo(signal), new FakeSlaClock());
      await expect(
        uc.execute({ signalId: signal.id, actor: 'a', justification: 'b' })
      ).rejects.toBeInstanceOf(AiSignalAlreadyGraduatedError);
    }
  });
});
