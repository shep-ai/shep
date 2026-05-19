/**
 * GraduateAiSignalToFindingUseCase unit tests (feature 098, phase 8, task-50).
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GraduateAiSignalToFindingUseCase } from '@/application/use-cases/aspm/ai-review/graduate-ai-signal-to-finding.js';
import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type AiChangeRiskSignal,
  type SecurityFinding,
} from '@/domain/generated/output.js';
import type { IAiChangeRiskSignalRepository } from '@/application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface.js';
import { AiSignalNotFoundError } from '@/domain/aspm/errors/ai-signal-not-found.error.js';
import { AiSignalAlreadyGraduatedError } from '@/domain/aspm/errors/ai-signal-already-graduated.error.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

function makeSignal(overrides: Partial<AiChangeRiskSignal> = {}): AiChangeRiskSignal {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: randomUUID(),
    applicationId: randomUUID(),
    agentSessionId: 'session-abc',
    signalType: AiSignalType.SecretInDiff,
    severity: CanonicalSeverity.High,
    summary: 'AI introduced AWS key',
    evidence: JSON.stringify({ path: 'src/x.ts' }),
    state: AiSignalState.Open,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeSignalRepo implements IAiChangeRiskSignalRepository {
  graduations: { id: string; findingId: string; at: Date }[] = [];
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
    return this.signal ? [this.signal] : [];
  }
  async markGraduated(id: string, findingId: string, at: Date): Promise<void> {
    this.graduations.push({ id, findingId, at });
  }
  async markDismissed() {
    return undefined;
  }
  async updateState() {
    return undefined;
  }
  async softDelete() {
    return undefined;
  }
}

function fakeFindingRepo(): IFindingRepository & { saved: SecurityFinding[] } {
  const saved: SecurityFinding[] = [];
  return {
    saved,
    create: async (f: SecurityFinding) => {
      saved.push(f);
    },
    bulkInsertOrIgnore: async () => ({ inserted: 0, duplicates: 0 }),
    findById: async () => null,
    list: async () => ({ items: [], total: 0 }),
    listRanked: async () => ({ items: [], total: 0 }),
    count: async () => 0,
    update: async () => undefined,
    softDelete: async () => undefined,
    countOpenBySeverity: async () => [],
    topAtRiskApplications: async () => [],
    countOpenKev: async () => 0,
    countSlaBreached: async () => 0,
    latestLastSeenAt: async () => null,
    countOpenBySeverityForApplication: async () => [],
    postureTrend: async () => [],
  } as unknown as IFindingRepository & { saved: SecurityFinding[] };
}

describe('GraduateAiSignalToFindingUseCase', () => {
  it('creates a SecurityFinding and marks the signal as graduated', async () => {
    const signal = makeSignal({ ownerId: 'owner-1' });
    const signalRepo = new FakeSignalRepo(signal);
    const findingRepo = fakeFindingRepo();
    const clock = new FakeSlaClock(new Date('2026-05-20T08:00:00Z'));

    const uc = new GraduateAiSignalToFindingUseCase(signalRepo, findingRepo, clock);
    const result = await uc.execute({ signalId: signal.id });

    expect(findingRepo.saved).toHaveLength(1);
    const f = findingRepo.saved[0];
    expect(f.applicationId).toBe(signal.applicationId);
    expect(f.findingDomain).toBe(FindingDomain.Ai);
    expect(f.canonicalSeverity).toBe(CanonicalSeverity.High);
    expect(f.state).toBe(FindingState.Open);
    expect(f.ownerId).toBe('owner-1');
    expect(f.ruleId).toContain('ai-change');
    expect(f.source).toBe('ai-change-review');

    expect(signalRepo.graduations).toHaveLength(1);
    expect(signalRepo.graduations[0].id).toBe(signal.id);
    expect(signalRepo.graduations[0].findingId).toBe(f.id);
    expect(result.signal.state).toBe(AiSignalState.GraduatedToFinding);
    expect(result.signal.graduatedFindingId).toBe(f.id);
  });

  it('uses signal summary as default title and description', async () => {
    const signal = makeSignal({ summary: 'Custom AI signal summary' });
    const signalRepo = new FakeSignalRepo(signal);
    const findingRepo = fakeFindingRepo();
    const uc = new GraduateAiSignalToFindingUseCase(signalRepo, findingRepo, new FakeSlaClock());

    await uc.execute({ signalId: signal.id });

    expect(findingRepo.saved[0].title).toBe('Custom AI signal summary');
    expect(findingRepo.saved[0].description).toBe('Custom AI signal summary');
  });

  it('throws AiSignalNotFoundError when the signal does not exist', async () => {
    const uc = new GraduateAiSignalToFindingUseCase(
      new FakeSignalRepo(null),
      fakeFindingRepo(),
      new FakeSlaClock()
    );
    await expect(uc.execute({ signalId: 'missing' })).rejects.toBeInstanceOf(AiSignalNotFoundError);
  });

  it('throws AiSignalAlreadyGraduatedError when the signal is already graduated', async () => {
    const signal = makeSignal({
      state: AiSignalState.GraduatedToFinding,
      graduatedFindingId: 'finding-xyz',
    });
    const uc = new GraduateAiSignalToFindingUseCase(
      new FakeSignalRepo(signal),
      fakeFindingRepo(),
      new FakeSlaClock()
    );
    await expect(uc.execute({ signalId: signal.id })).rejects.toBeInstanceOf(
      AiSignalAlreadyGraduatedError
    );
  });

  it('throws AiSignalAlreadyGraduatedError when the signal is dismissed', async () => {
    const signal = makeSignal({ state: AiSignalState.Dismissed });
    const uc = new GraduateAiSignalToFindingUseCase(
      new FakeSignalRepo(signal),
      fakeFindingRepo(),
      new FakeSlaClock()
    );
    await expect(uc.execute({ signalId: signal.id })).rejects.toBeInstanceOf(
      AiSignalAlreadyGraduatedError
    );
  });
});
