/**
 * ListAiSignalsUseCase unit tests (feature 098, phase 8, task-50).
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ListAiSignalsUseCase } from '@/application/use-cases/aspm/ai-review/list-ai-signals.js';
import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  type AiChangeRiskSignal,
} from '@/domain/generated/output.js';
import type {
  AiSignalListFilter,
  IAiChangeRiskSignalRepository,
} from '@/application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';

function makeSignal(overrides: Partial<AiChangeRiskSignal> = {}): AiChangeRiskSignal {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: randomUUID(),
    applicationId: randomUUID(),
    signalType: AiSignalType.SecretInDiff,
    severity: CanonicalSeverity.High,
    summary: 'AI signal',
    state: AiSignalState.Open,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeSignalRepo implements IAiChangeRiskSignalRepository {
  lastFilter: AiSignalListFilter | undefined;
  constructor(private readonly signals: AiChangeRiskSignal[]) {}
  async countOpen() {
    return this.signals.length;
  }
  async create() {
    /* noop */
  }
  async findById() {
    return null;
  }
  async list(filter?: AiSignalListFilter): Promise<AiChangeRiskSignal[]> {
    this.lastFilter = filter;
    return this.signals;
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

describe('ListAiSignalsUseCase', () => {
  it('returns the signals returned by the repository', async () => {
    const signals = [makeSignal(), makeSignal()];
    const repo = new FakeSignalRepo(signals);
    const uc = new ListAiSignalsUseCase(repo);

    const result = await uc.execute();
    expect(result.map((s) => s.id)).toEqual(signals.map((s) => s.id));
  });

  it('forwards filter fields to the repository', async () => {
    const repo = new FakeSignalRepo([]);
    const uc = new ListAiSignalsUseCase(repo);

    const appId = randomUUID();
    await uc.execute({
      applicationId: appId,
      agentSessionId: 'session-1',
      states: [AiSignalState.Open],
      signalTypes: [AiSignalType.SecretInDiff],
      limit: 10,
      offset: 5,
    });

    expect(repo.lastFilter).toEqual({
      applicationId: appId,
      agentSessionId: 'session-1',
      states: [AiSignalState.Open],
      signalTypes: [AiSignalType.SecretInDiff],
      limit: 10,
      offset: 5,
    });
  });

  it('defaults to no filter (repository decides the default state set)', async () => {
    const repo = new FakeSignalRepo([]);
    const uc = new ListAiSignalsUseCase(repo);

    await uc.execute();

    expect(repo.lastFilter).toEqual({
      applicationId: undefined,
      agentSessionId: undefined,
      states: undefined,
      signalTypes: undefined,
      limit: undefined,
      offset: undefined,
    });
  });

  // A non-numeric `--limit abc` reaches the use case as NaN, which SQLite
  // rejects in `LIMIT ? OFFSET ?` instead of reading a page of rows. The
  // repository's `?? DEFAULT` cannot catch it — NaN is not nullish — so the
  // use case drops it and leaves the repository to apply its own default.
  it('drops a NaN limit so the repository applies its own default', async () => {
    const repo = new FakeSignalRepo([]);
    const uc = new ListAiSignalsUseCase(repo);

    await uc.execute({ limit: Number('abc') });

    expect(repo.lastFilter?.limit).toBeUndefined();
  });

  it('drops a NaN offset so the repository applies its own default', async () => {
    const repo = new FakeSignalRepo([]);
    const uc = new ListAiSignalsUseCase(repo);

    await uc.execute({ offset: Number('abc') });

    expect(repo.lastFilter?.offset).toBeUndefined();
  });

  it('forwards a finite limit and offset unchanged', async () => {
    const repo = new FakeSignalRepo([]);
    const uc = new ListAiSignalsUseCase(repo);

    await uc.execute({ limit: 25, offset: 50 });

    expect(repo.lastFilter?.limit).toBe(25);
    expect(repo.lastFilter?.offset).toBe(50);
  });
});
