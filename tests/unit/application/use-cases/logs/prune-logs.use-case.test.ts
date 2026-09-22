/**
 * PruneLogsUseCase — the business half of `shep logs prune`.
 *
 * Also the log-file half of unattended data retention (spec 116), which is
 * why the log of a still-active run must never be selected.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { PruneLogsUseCase } from '@/application/use-cases/logs/prune-logs.use-case.js';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type {
  ILogFileStore,
  LogFileInfo,
} from '@/application/ports/output/services/log-file-store.interface.js';

const NOW = new Date('2026-09-20T12:00:00.000Z');
const DAY_MS = 86_400_000;

function file(name: string, ageDays: number, sizeBytes = 1000): LogFileInfo {
  return {
    path: `/home/u/.shep/logs/${name}`,
    name,
    sizeBytes,
    modifiedAt: new Date(NOW.getTime() - ageDays * DAY_MS),
  };
}

function store(files: LogFileInfo[], remove = vi.fn().mockResolvedValue(undefined)): ILogFileStore {
  return {
    getLogsDirectory: () => '/home/u/.shep/logs',
    list: async () => files,
    remove,
  };
}

/** A run repository that reports the given runs, by id and status. */
function runs(...rows: { id: string; status: AgentRunStatus }[]) {
  return { list: vi.fn(async () => rows) };
}

function newPruneLogs(logStore: ILogFileStore, runRepo = runs()): PruneLogsUseCase {
  return new PruneLogsUseCase(logStore, runRepo as never);
}

describe('PruneLogsUseCase', () => {
  it('is a dry run by default and deletes nothing', async () => {
    const remove = vi.fn();
    const result = await newPruneLogs(store([file('worker-a.log', 30)], remove)).execute({
      olderThan: '7d',
      now: NOW,
    });

    expect(result.dryRun).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(result.candidates.map((c) => c.name)).toEqual(['worker-a.log']);
    expect(result.deleted).toEqual([]);
  });

  it('reports the bytes a dry run would reclaim', async () => {
    const result = await newPruneLogs(
      store([file('worker-a.log', 30, 4096), file('worker-b.log', 30, 1024)])
    ).execute({ olderThan: '7d', now: NOW });

    expect(result.reclaimableBytes).toBe(5120);
  });

  it('selects only files older than the cutoff', async () => {
    const result = await newPruneLogs(
      store([file('old.log', 30), file('recent.log', 2), file('exactly.log', 7)])
    ).execute({ olderThan: '7d', now: NOW });

    expect(result.candidates.map((c) => c.name).sort()).toEqual(['exactly.log', 'old.log']);
  });

  it('deletes when confirmed and reports what it removed', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const result = await newPruneLogs(store([file('worker-a.log', 30, 2048)], remove)).execute({
      olderThan: '7d',
      dryRun: false,
      now: NOW,
    });

    expect(result.dryRun).toBe(false);
    expect(remove).toHaveBeenCalledWith('/home/u/.shep/logs/worker-a.log');
    expect(result.deleted.map((d) => d.name)).toEqual(['worker-a.log']);
    expect(result.reclaimedBytes).toBe(2048);
    expect(result.failures).toEqual([]);
  });

  it('reports a failed delete instead of counting it as reclaimed', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('EACCES'));
    const result = await newPruneLogs(store([file('worker-a.log', 30, 2048)], remove)).execute({
      olderThan: '7d',
      dryRun: false,
      now: NOW,
    });

    expect(result.deleted).toEqual([]);
    expect(result.reclaimedBytes).toBe(0);
    expect(result.failures).toEqual([{ path: '/home/u/.shep/logs/worker-a.log', error: 'EACCES' }]);
  });

  it('keeps going after one failure so a single locked file does not abort the prune', async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValueOnce(undefined);
    const result = await newPruneLogs(
      store([file('a.log', 30), file('b.log', 30)], remove)
    ).execute({ olderThan: '7d', dryRun: false, now: NOW });

    expect(result.deleted).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
  });

  it('rejects an unparseable --older-than rather than deleting everything', async () => {
    await expect(
      newPruneLogs(store([file('a.log', 30)])).execute({ olderThan: 'forever', now: NOW })
    ).rejects.toThrow(/older-than/i);
  });

  it('rejects a bare number, which would be an ambiguous unit', async () => {
    await expect(
      newPruneLogs(store([file('a.log', 30)])).execute({ olderThan: '7', now: NOW })
    ).rejects.toThrow(/older-than/i);
  });

  it('applies a default age when none was given, rather than pruning everything', async () => {
    const result = await newPruneLogs(store([file('old.log', 60), file('fresh.log', 1)])).execute({
      now: NOW,
    });

    expect(result.candidates.map((c) => c.name)).toEqual(['old.log']);
    expect(result.olderThanMs).toBeGreaterThan(0);
  });

  it('reports the total footprint and directory so the caller can render context', async () => {
    const result = await newPruneLogs(
      store([file('a.log', 30, 100), file('b.log', 1, 900)])
    ).execute({ olderThan: '7d', now: NOW });

    expect(result.totalFiles).toBe(2);
    expect(result.totalBytes).toBe(1000);
    expect(result.logsDirectory).toBe('/home/u/.shep/logs');
  });

  it('returns an empty result for an empty log directory', async () => {
    const result = await newPruneLogs(store([])).execute({ olderThan: '7d', now: NOW });
    expect(result.candidates).toEqual([]);
    expect(result.totalFiles).toBe(0);
  });

  // Spec 116: retention now runs unattended in the daemon, so a feature that
  // has idled at an approval gate for weeks must not lose its only log.
  it('never selects the log of a run that is still active, however old', async () => {
    const result = await newPruneLogs(
      store([
        file('worker-waiting.log', 60),
        file('worker-running.log', 60),
        file('cluster-worker-pending.log', 60),
        file('worker-done.log', 60),
      ]),
      runs(
        { id: 'waiting', status: AgentRunStatus.waitingApproval },
        { id: 'running', status: AgentRunStatus.running },
        { id: 'pending', status: AgentRunStatus.pending },
        { id: 'done', status: AgentRunStatus.completed }
      )
    ).execute({ olderThan: '7d', dryRun: false, now: NOW });

    expect(result.candidates.map((c) => c.name)).toEqual(['worker-done.log']);
    expect(result.deleted.map((c) => c.name)).toEqual(['worker-done.log']);
  });
});
