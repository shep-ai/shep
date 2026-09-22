/**
 * PruneRetainedDataUseCase Unit Tests
 *
 * The use case has to do two things and no more: prune once per interval, and
 * actually call the operation log's `pruneBefore` — which existed with no
 * caller at all, which is why the operation log grew forever.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PruneRetainedDataUseCase } from '@/application/use-cases/maintenance/prune-retained-data.use-case.js';
import {
  DEFAULT_DATA_RETENTION_DAYS,
  DATA_RETENTION_PRUNE_INTERVAL_MS,
  retentionCutoff,
} from '@/domain/shared/data-retention.js';

const NOW = new Date('2026-06-01T00:00:00Z');

const EMPTY_COUNTS = {
  activityLog: 0,
  agentMessages: 0,
  interactiveMessages: 0,
  phaseTimings: 0,
  notifications: 0,
};

describe('PruneRetainedDataUseCase', () => {
  let retentionRepo: {
    claimPruneCycle: ReturnType<typeof vi.fn>;
    pruneOlderThan: ReturnType<typeof vi.fn>;
  };
  let operationLogRepo: { pruneBefore: ReturnType<typeof vi.fn> };
  let pruneLogs: { execute: ReturnType<typeof vi.fn> };
  let useCase: PruneRetainedDataUseCase;

  beforeEach(() => {
    retentionRepo = {
      claimPruneCycle: vi.fn().mockResolvedValue(true),
      pruneOlderThan: vi.fn().mockResolvedValue({ ...EMPTY_COUNTS, activityLog: 3 }),
    };
    operationLogRepo = { pruneBefore: vi.fn().mockResolvedValue(7) };
    pruneLogs = {
      execute: vi.fn().mockResolvedValue({ deleted: [{}, {}], reclaimedBytes: 10, failures: [] }),
    };
    useCase = new PruneRetainedDataUseCase(
      retentionRepo as never,
      operationLogRepo as never,
      pruneLogs as never
    );
  });

  it('prunes everything older than the retention window', async () => {
    const result = await useCase.execute({ now: NOW });

    const expectedCutoff = retentionCutoff(NOW, DEFAULT_DATA_RETENTION_DAYS);
    expect(result.pruned).toBe(true);
    expect(result.cutoff?.getTime()).toBe(expectedCutoff.getTime());
    expect(retentionRepo.pruneOlderThan).toHaveBeenCalledWith(expectedCutoff);
  });

  it('calls the operation log prune that previously had no caller', async () => {
    const result = await useCase.execute({ now: NOW });

    expect(operationLogRepo.pruneBefore).toHaveBeenCalledWith(
      retentionCutoff(NOW, DEFAULT_DATA_RETENTION_DAYS).getTime()
    );
    expect(result.counts?.operationLog).toBe(7);
  });

  it('reports what each table gave up', async () => {
    const result = await useCase.execute({ now: NOW });

    expect(result.counts).toEqual({
      ...EMPTY_COUNTS,
      activityLog: 3,
      operationLog: 7,
      workerLogFiles: 2,
    });
  });

  it('does nothing when another process already pruned inside the interval', async () => {
    retentionRepo.claimPruneCycle.mockResolvedValue(false);

    const result = await useCase.execute({ now: NOW });

    expect(result).toEqual({ pruned: false });
    expect(retentionRepo.pruneOlderThan).not.toHaveBeenCalled();
    expect(operationLogRepo.pruneBefore).not.toHaveBeenCalled();
    expect(pruneLogs.execute).not.toHaveBeenCalled();
  });

  it('claims the cycle with the configured interval', async () => {
    await useCase.execute({ now: NOW });

    expect(retentionRepo.claimPruneCycle).toHaveBeenCalledWith(
      NOW,
      DATA_RETENTION_PRUNE_INTERVAL_MS
    );
  });

  it('skips the interval check when forced', async () => {
    retentionRepo.claimPruneCycle.mockResolvedValue(false);

    const result = await useCase.execute({ now: NOW, force: true });

    expect(result.pruned).toBe(true);
    expect(retentionRepo.claimPruneCycle).not.toHaveBeenCalled();
  });

  it('honours an overridden retention window', async () => {
    await useCase.execute({ now: NOW, retentionDays: 7 });

    expect(retentionRepo.pruneOlderThan).toHaveBeenCalledWith(retentionCutoff(NOW, 7));
  });

  // Spec 116: nothing deleted ~/.shep/logs/worker-*.log unless a user ran
  // `shep logs prune --yes`. The same window now governs them.
  it('deletes worker logs past the same retention window', async () => {
    await useCase.execute({ now: NOW, retentionDays: 30 });

    expect(pruneLogs.execute).toHaveBeenCalledWith({ olderThan: '30d', dryRun: false, now: NOW });
  });
});
