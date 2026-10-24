/**
 * SampleProcessStatsUseCase Unit Tests (spec 144)
 *
 * `shep status` reads the daemon's CPU and memory through the same probe as
 * `shep ps`, instead of shelling out to ps itself.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SampleProcessStatsUseCase } from '@/application/use-cases/processes/sample-process-stats.use-case.js';

describe('SampleProcessStatsUseCase', () => {
  it("returns the process's stats", async () => {
    const probe = {
      sample: vi.fn(
        async () => new Map([[42, { cpuPercent: 2.3, rssBytes: 1024, zombie: false }]])
      ),
    };
    expect(await new SampleProcessStatsUseCase(probe).execute(42)).toEqual({
      cpuPercent: 2.3,
      rssBytes: 1024,
      zombie: false,
    });
    expect(probe.sample).toHaveBeenCalledWith([42]);
  });

  it('returns undefined when the probe has no numbers', async () => {
    const probe = { sample: vi.fn(async () => new Map()) };
    expect(await new SampleProcessStatsUseCase(probe).execute(42)).toBeUndefined();
  });
});
