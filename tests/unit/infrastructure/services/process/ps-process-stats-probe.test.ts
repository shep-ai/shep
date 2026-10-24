/**
 * PsProcessStatsProbe Unit Tests (spec 144)
 *
 * One `ps` call samples every PID; anything unexpected yields no numbers
 * rather than an error.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi } from 'vitest';
import {
  PsProcessStatsProbe,
  parsePsStats,
} from '@/infrastructure/services/process/ps-process-stats-probe.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';

const KIB = 1024;

describe('parsePsStats', () => {
  it('reads pid, state, cpu and rss (KiB) per line', () => {
    const stats = parsePsStats('  123 Ss  1.5  102400\n 4567 R+ 12.0   2048\n');
    expect(stats.get(123)).toEqual({ cpuPercent: 1.5, rssBytes: 102400 * KIB, zombie: false });
    expect(stats.get(4567)).toEqual({ cpuPercent: 12, rssBytes: 2048 * KIB, zombie: false });
  });

  it('flags a zombie: exited, not yet reaped, still answering kill(pid, 0)', () => {
    expect(parsePsStats('12071 Zs 108 0\n').get(12071)).toEqual({
      cpuPercent: 108,
      rssBytes: 0,
      zombie: true,
    });
  });

  it('accepts a decimal comma and CRLF line endings', () => {
    expect(parsePsStats('99 S 0,3 512\r\n').get(99)).toEqual({
      cpuPercent: 0.3,
      rssBytes: 512 * KIB,
      zombie: false,
    });
  });

  it('skips malformed lines', () => {
    const stats = parsePsStats('PID STAT %CPU RSS\nabc S 1 2\n12 S x 3\n8 1.0 9\n7 S 1.0 9\n\n');
    expect([...stats.keys()]).toEqual([7]);
  });
});

describe('PsProcessStatsProbe', () => {
  it('samples every pid in one ps call, argv only', async () => {
    const exec = vi.fn<ExecFunction>(async () => ({
      stdout: '1 S 0.5 10\n2 R 1.5 20\n',
      stderr: '',
    }));
    const stats = await new PsProcessStatsProbe(exec, false).sample([1, 2]);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('ps', ['-o', 'pid=,stat=,pcpu=,rss=', '-p', '1,2'], {
      timeout: expect.any(Number),
      windowsHide: true,
    });
    expect(stats.get(2)).toEqual({ cpuPercent: 1.5, rssBytes: 20 * KIB, zombie: false });
  });

  it('skips the call when there are no valid pids', async () => {
    const exec = vi.fn<ExecFunction>();
    const stats = await new PsProcessStatsProbe(exec, false).sample([0, -1, Number.NaN]);
    expect(exec).not.toHaveBeenCalled();
    expect(stats.size).toBe(0);
  });

  it('returns no numbers when ps fails (one of the pids may already be gone)', async () => {
    const exec = vi.fn<ExecFunction>(async () => {
      throw Object.assign(new Error('Command failed'), { stdout: '5 S 2.0 30\n' });
    });
    const stats = await new PsProcessStatsProbe(exec, false).sample([5, 6]);
    // ps exits 1 when any pid is missing, but still prints the ones it found.
    expect(stats.get(5)).toEqual({ cpuPercent: 2, rssBytes: 30 * KIB, zombie: false });

    const failing = vi.fn<ExecFunction>(async () => {
      throw new Error('spawn ps ENOENT');
    });
    expect((await new PsProcessStatsProbe(failing, false).sample([5])).size).toBe(0);
  });

  it('is empty on Windows, where ps does not exist', async () => {
    const exec = vi.fn<ExecFunction>();
    expect((await new PsProcessStatsProbe(exec, true).sample([1])).size).toBe(0);
    expect(exec).not.toHaveBeenCalled();
  });
});
