/**
 * ListInventoryPostureUseCase unit tests
 *
 * Aggregator the ASPM Inventory page uses to render per-application
 * vulnerability badges + last-scanned timestamps in a single round-trip
 * server fetch. Composes ListApplicationsUseCase with
 * IFindingRepository.countOpenBySeverity, so the asserts here focus on
 * the wiring + per-application failure isolation.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { ListInventoryPostureUseCase } from '@/application/use-cases/aspm/posture/list-inventory-posture';
import { CanonicalSeverity, ApplicationStatus, type Application } from '@/domain/generated/output';
import type { ListApplicationsUseCase } from '@/application/use-cases/applications/list-applications.use-case';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface';

const now = new Date('2026-05-21T10:00:00Z');
const lastScannedAt = new Date('2026-05-20T08:30:00Z');

function makeApp(overrides: Partial<Application> & { id: string; name: string }): Application {
  return {
    repositoryPath: `/repos/${overrides.id}`,
    branch: 'main',
    status: ApplicationStatus.Idle,
    setupComplete: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Application;
}

describe('ListInventoryPostureUseCase', () => {
  it('returns one row per application with its severity counts and lastScannedAt', async () => {
    const apps = [
      {
        ...makeApp({ id: 'app-1', name: 'cli-platform', lastScannedAt }),
        effectiveStatus: 'ready',
      },
      {
        ...makeApp({ id: 'app-2', name: 'web-frontend', lastScannedAt: undefined }),
        effectiveStatus: 'ready',
      },
    ];
    const listApps = {
      execute: vi.fn().mockResolvedValue(apps),
    } as unknown as ListApplicationsUseCase;

    const countOpenBySeverity = vi.fn(async (filter?: { applicationIds?: string[] }) => {
      const id = filter?.applicationIds?.[0];
      if (id === 'app-1') {
        return [
          { severity: CanonicalSeverity.Critical, count: 2 },
          { severity: CanonicalSeverity.High, count: 5 },
          { severity: CanonicalSeverity.Medium, count: 1 },
        ];
      }
      return [{ severity: CanonicalSeverity.Low, count: 3 }];
    });
    const findingRepo = { countOpenBySeverity } as unknown as IFindingRepository;

    const uc = new ListInventoryPostureUseCase(listApps, findingRepo);
    const result = await uc.execute();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      applicationId: 'app-1',
      name: 'cli-platform',
      repositoryPath: '/repos/app-1',
      lastScannedAt,
      totalOpen: 8,
    });
    expect(result[0]?.openBySeverity).toEqual([
      { severity: CanonicalSeverity.Critical, count: 2 },
      { severity: CanonicalSeverity.High, count: 5 },
      { severity: CanonicalSeverity.Medium, count: 1 },
    ]);
    expect(result[1]).toMatchObject({
      applicationId: 'app-2',
      name: 'web-frontend',
      lastScannedAt: null,
      totalOpen: 3,
    });
    expect(countOpenBySeverity).toHaveBeenCalledWith({ applicationIds: ['app-1'] });
    expect(countOpenBySeverity).toHaveBeenCalledWith({ applicationIds: ['app-2'] });
  });

  it('returns an empty list when no applications are inventoried', async () => {
    const listApps = {
      execute: vi.fn().mockResolvedValue([]),
    } as unknown as ListApplicationsUseCase;
    const findingRepo = {
      countOpenBySeverity: vi.fn(),
    } as unknown as IFindingRepository;

    const uc = new ListInventoryPostureUseCase(listApps, findingRepo);
    const result = await uc.execute();

    expect(result).toEqual([]);
    expect(findingRepo.countOpenBySeverity).not.toHaveBeenCalled();
  });

  it('isolates per-application failures so one bad count never starves the rest', async () => {
    const apps = [
      { ...makeApp({ id: 'app-1', name: 'good' }), effectiveStatus: 'ready' },
      { ...makeApp({ id: 'app-2', name: 'bad' }), effectiveStatus: 'ready' },
      { ...makeApp({ id: 'app-3', name: 'good-2' }), effectiveStatus: 'ready' },
    ];
    const listApps = {
      execute: vi.fn().mockResolvedValue(apps),
    } as unknown as ListApplicationsUseCase;

    const countOpenBySeverity = vi.fn(async (filter?: { applicationIds?: string[] }) => {
      const id = filter?.applicationIds?.[0];
      if (id === 'app-2') throw new Error('boom');
      return [{ severity: CanonicalSeverity.High, count: 1 }];
    });
    const findingRepo = { countOpenBySeverity } as unknown as IFindingRepository;

    const uc = new ListInventoryPostureUseCase(listApps, findingRepo);
    const result = await uc.execute();

    expect(result).toHaveLength(3);
    expect(result[0]?.openBySeverity).toEqual([{ severity: CanonicalSeverity.High, count: 1 }]);
    expect(result[1]).toMatchObject({
      applicationId: 'app-2',
      openBySeverity: [],
      totalOpen: 0,
      countsError: 'boom',
    });
    expect(result[2]?.openBySeverity).toHaveLength(1);
  });
});
