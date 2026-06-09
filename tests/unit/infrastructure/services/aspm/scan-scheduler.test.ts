import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ScanSchedulerService } from '@/infrastructure/services/aspm/scan-scheduler.service';
import { ScanTrigger, type Application } from '@/domain/generated/output';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface';
import type { RescanApplicationUseCase } from '@/application/use-cases/aspm/scan/rescan-application';

function makeApp(overrides: Partial<Application>): Application {
  return {
    id: overrides.id ?? 'a',
    name: 'x',
    slug: 'x',
    description: '',
    repositoryPath: '/r',
    additionalPaths: [],
    status: 'Idle' as never,
    setupComplete: true,
    bedrockEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeScheduler(opts: {
  apps: Application[];
  enabled?: boolean;
  now?: () => Date;
  onRescan?: (applicationId: string) => Promise<void>;
}) {
  const appRepo = { list: async () => opts.apps } as unknown as IApplicationRepository;
  const rescanMock = vi.fn(async (input: { applicationId: string; triggeredBy?: ScanTrigger }) => {
    if (opts.onRescan) await opts.onRescan(input.applicationId);
    return { scanRunId: 'r', status: 'Succeeded' as never, findingsInserted: 0, stages: [] };
  });
  const rescan = { execute: rescanMock } as unknown as RescanApplicationUseCase;
  const scheduler = new ScanSchedulerService(appRepo, rescan);
  scheduler.configure({
    now: opts.now ?? (() => new Date('2026-05-20T15:00:00Z')),
    staleAfterMs: 24 * 60 * 60 * 1000,
    enabled: opts.enabled === undefined ? () => true : () => opts.enabled!,
  });
  return { scheduler, rescanMock };
}

describe('ScanSchedulerService', () => {
  it('rescans apps whose lastScannedAt is older than the 24h threshold', async () => {
    const now = new Date('2026-05-20T15:00:00Z');
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const { scheduler, rescanMock } = makeScheduler({
      apps: [makeApp({ id: 'stale', lastScannedAt: old })],
      now: () => now,
    });

    await scheduler.tick();

    expect(rescanMock).toHaveBeenCalledOnce();
    expect(rescanMock.mock.calls[0][0]).toMatchObject({
      applicationId: 'stale',
      triggeredBy: ScanTrigger.Schedule,
    });
  });

  it('skips apps whose lastScannedAt is within the 24h window', async () => {
    const now = new Date('2026-05-20T15:00:00Z');
    const recent = new Date(now.getTime() - 60 * 60 * 1000);
    const { scheduler, rescanMock } = makeScheduler({
      apps: [makeApp({ id: 'fresh', lastScannedAt: recent })],
      now: () => now,
    });

    await scheduler.tick();
    expect(rescanMock).not.toHaveBeenCalled();
  });

  it('honors per-application autoRescan opt-out', async () => {
    const now = new Date('2026-05-20T15:00:00Z');
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const { scheduler, rescanMock } = makeScheduler({
      apps: [
        makeApp({
          id: 'opted-out',
          lastScannedAt: old,
          scannerProfile: {
            enabledStages: ['sbom' as never],
            pathExcludes: [],
            autoRescan: false,
          },
        }),
      ],
      now: () => now,
    });
    await scheduler.tick();
    expect(rescanMock).not.toHaveBeenCalled();
  });

  it('respects the global enabled toggle', async () => {
    const now = new Date('2026-05-20T15:00:00Z');
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const { scheduler, rescanMock } = makeScheduler({
      apps: [makeApp({ id: 'stale', lastScannedAt: old })],
      now: () => now,
      enabled: false,
    });

    await scheduler.tick();
    expect(rescanMock).not.toHaveBeenCalled();
  });

  it('rescans apps that have never been scanned (lastScannedAt undefined)', async () => {
    const { scheduler, rescanMock } = makeScheduler({
      apps: [makeApp({ id: 'never', lastScannedAt: undefined })],
    });
    await scheduler.tick();
    expect(rescanMock).toHaveBeenCalledOnce();
  });
});
