import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ListHarnessHistoryUseCase } from '@/application/use-cases/harness-learning/list-harness-history.use-case.js';
import { GetHarnessVersionUseCase } from '@/application/use-cases/harness-learning/get-harness-version.use-case.js';
import { RecordVersionOutcomeUseCase } from '@/application/use-cases/harness-learning/record-version-outcome.use-case.js';
import {
  InMemoryHarnessRefinementRepository,
  InMemoryLearnedHarnessRepository,
  fakeSettingsRepository,
  fakeSpaceContext,
} from '../../../../helpers/harness-learning.fakes.js';
import {
  HarnessComponentKind,
  HarnessOrigin,
  HarnessVersionTrend,
  LearnedHarnessStatus,
  MemoryScope,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';

const v = (id: string, over: Partial<LearnedHarnessVersion> = {}): LearnedHarnessVersion => ({
  id,
  scope: MemoryScope.Project,
  repositoryPath: '/repos/app',
  status: LearnedHarnessStatus.Superseded,
  origin: HarnessOrigin.Reflect,
  components: [],
  createdAt: new Date(Number(id.replace(/\D/g, '')) * 1000),
  updatedAt: new Date(0),
  ...over,
});

const SIGNALS = {
  merged: true,
  ciFixAttempts: 0,
  ciFixHistory: [],
  rejectionFeedback: [],
  validationRepairs: 0,
  lastValidationErrors: [],
};

async function setup() {
  const harnesses = new InMemoryLearnedHarnessRepository();
  const runs = new InMemoryHarnessRefinementRepository();
  await harnesses.createVersion(v('v1'));
  await harnesses.createVersion(
    v('v2', { parentVersionId: 'v1', status: LearnedHarnessStatus.Adopted })
  );
  const record = new RecordVersionOutcomeUseCase(
    {
      findByFeatureId: vi.fn(async () => [
        { numTurns: 10, costUsd: 1 },
        { numTurns: 5, costUsd: 0.5 },
      ]),
    } as never,
    runs
  );
  const history = new ListHarnessHistoryUseCase(
    fakeSettingsRepository({ learning: { regressionMinSample: 3 } }),
    harnesses,
    runs,
    fakeSpaceContext()
  );
  return { harnesses, runs, record, history };
}

describe('RecordVersionOutcomeUseCase', () => {
  it('sums turns and cost from phase timings and counts gate rejections', async () => {
    const { runs, record } = await setup();
    await record.execute({
      versionId: 'v2',
      featureId: 'f1',
      signals: { ...SIGNALS, ciFixAttempts: 2, rejectionFeedback: ['a', 'b'] },
    });
    expect(runs.outcomes[0]).toMatchObject({
      versionId: 'v2',
      featureId: 'f1',
      ciFixAttempts: 2,
      gateRejections: 2,
      numTurns: 15,
      costUsd: 1.5,
      merged: true,
    });
  });
});

describe('ListHarnessHistoryUseCase', () => {
  it('lists versions newest first and marks the current one', async () => {
    const { history } = await setup();
    const result = await history.execute({ repositoryPath: '/repos/app' });
    expect(result.versions.map((e) => e.version.id)).toEqual(['v2', 'v1']);
    expect(result.currentVersionId).toBe('v2');
    expect(result.versions[0].trend).toBe(HarnessVersionTrend.InsufficientData);
  });

  it('flags a version that regressed against its parent once both have the sample', async () => {
    const { record, history } = await setup();
    for (let i = 0; i < 3; i++) {
      await record.execute({ versionId: 'v1', featureId: `a${i}`, signals: SIGNALS });
      await record.execute({
        versionId: 'v2',
        featureId: `b${i}`,
        signals: { ...SIGNALS, merged: false, ciFixAttempts: 4, rejectionFeedback: ['x'] },
      });
    }
    const result = await history.execute({ repositoryPath: '/repos/app' });
    expect(result.versions[0].trend).toBe(HarnessVersionTrend.Regressed);
    expect(result.versions[0].metrics.count).toBe(3);
    expect(result.versions[0].relativeChange).toBeGreaterThan(0);
  });
});

describe('GetHarnessVersionUseCase', () => {
  it('diffs a version against its parent, or against a chosen version', async () => {
    const harnesses = new InMemoryLearnedHarnessRepository();
    const g = (path: string, content: string) => ({
      kind: HarnessComponentKind.Guardrails,
      path,
      content,
      sha256: 'h',
    });
    await harnesses.createVersion(v('v1', { components: [g('guardrails.md', 'A')] }));
    await harnesses.createVersion(
      v('v2', { parentVersionId: 'v1', components: [g('guardrails.md', 'B')] })
    );
    const get = new GetHarnessVersionUseCase(harnesses);
    const detail = await get.execute({ versionId: 'v2' });
    expect(detail?.base?.id).toBe('v1');
    expect(detail?.diff.modified).toEqual(['guardrails.md']);
    expect(detail?.diffText).toContain('~ guardrails.md\nB');
    expect((await get.execute({ versionId: 'v2', againstVersionId: 'v2' }))?.diff.kept).toEqual([
      'guardrails.md',
    ]);
    expect(await get.execute({ versionId: 'missing' })).toBeNull();
  });
});
