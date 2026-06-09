/**
 * GetApplicationPostureUseCase unit tests (feature 098, phase 7, task-41).
 */

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { GetApplicationPostureUseCase } from '@/application/use-cases/aspm/posture/get-application-posture.js';
import { ApplicationNotFoundError } from '@/domain/aspm/errors/application-not-found.error.js';
import { CanonicalSeverity, type Application } from '@/domain/generated/output.js';
import type {
  IFindingRepository,
  ListFindingsCursor,
  RankedFinding,
} from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { FindingFilter } from '@/domain/generated/output.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

const FIXED_NOW = new Date('2026-05-19T00:00:00.000Z');

function makeApp(id: string): Application {
  return {
    id,
    name: `App ${id}`,
    slug: id,
    path: `/tmp/${id}`,
    repositoryPath: `/tmp/${id}`,
    status: 'Idle',
    setupComplete: true,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  } as unknown as Application;
}

function fakeFindingRepo(): IFindingRepository {
  return {
    listRanked: async (_filter: FindingFilter, cursor: ListFindingsCursor) => ({
      items: Array.from({ length: cursor.limit }).map(
        (_, i) =>
          ({
            finding: { id: `f-${i}`, applicationId: 'app-1' },
            riskScoreTotal: 95 - i,
          }) as unknown as RankedFinding
      ),
      total: cursor.limit,
    }),
    countOpenBySeverityForApplication: async () => [
      { severity: CanonicalSeverity.Critical, count: 1 },
      { severity: CanonicalSeverity.High, count: 2 },
      { severity: CanonicalSeverity.Medium, count: 5 },
      { severity: CanonicalSeverity.Low, count: 1 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
    postureTrend: async (buckets: readonly Date[]) =>
      buckets.map((bucketStart: Date) => ({
        bucketStart,
        countsBySeverity: [{ severity: CanonicalSeverity.Critical, count: 1 }],
      })),
  } as unknown as IFindingRepository;
}

function fakeAppRepo(app: Application | null): IApplicationRepository {
  return {
    create: async () => undefined,
    findById: async () => app,
    findBySlug: async () => app,
    findByPath: async () => app,
    list: async () => (app ? [app] : []),
    update: async () => undefined,
    softDelete: async () => undefined,
    restore: async () => undefined,
  };
}

describe('GetApplicationPostureUseCase', () => {
  it('returns aggregated posture for an existing application', async () => {
    const uc = new GetApplicationPostureUseCase(
      fakeFindingRepo(),
      fakeAppRepo(makeApp('app-1')),
      new FakeSlaClock(FIXED_NOW)
    );
    const result = await uc.execute({ applicationId: 'app-1' });
    expect(result.applicationId).toBe('app-1');
    expect(result.openBySeverity.length).toBe(5);
    expect(result.topFindings.length).toBe(10);
    expect(result.sparkline.length).toBe(30);
  });

  it('throws ApplicationNotFoundError when the application id is unknown', async () => {
    const uc = new GetApplicationPostureUseCase(
      fakeFindingRepo(),
      fakeAppRepo(null),
      new FakeSlaClock(FIXED_NOW)
    );
    await expect(uc.execute({ applicationId: 'missing' })).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    );
  });

  it('honors the topFindingsLimit input', async () => {
    let receivedLimit = -1;
    const repo = fakeFindingRepo();
    const original = repo.listRanked;
    repo.listRanked = async (filter: FindingFilter, cursor: ListFindingsCursor) => {
      receivedLimit = cursor.limit;
      return original(filter, cursor);
    };
    const uc = new GetApplicationPostureUseCase(
      repo,
      fakeAppRepo(makeApp('app-1')),
      new FakeSlaClock(FIXED_NOW)
    );
    await uc.execute({ applicationId: 'app-1', topFindingsLimit: 3 });
    expect(receivedLimit).toBe(3);
  });
});
