/**
 * GetUsageStatsUseCase — the aggregation behind `shep usage`.
 *
 * The honesty requirement is load-bearing and has its own describe block:
 * `costUsd` is populated ONLY by the Claude executors. The shared AI-SDK
 * base (OpenRouter/Together/Ollama/LLMProxy) maps tokens and never sets
 * cost, so those runs record no cost — and the web UI already sums that
 * into a "total" it presents as fact. This use case must not.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { GetUsageStatsUseCase } from '@/application/use-cases/usage/get-usage-stats.use-case.js';
import type {
  IUsageStatsRepository,
  UsageSample,
} from '@/application/ports/output/repositories/usage-stats-repository.interface.js';
import { UsageGroupBy } from '@/domain/shared/usage-grouping.js';

const NOW = new Date('2026-09-20T12:00:00.000Z');

function sample(overrides: Partial<UsageSample> = {}): UsageSample {
  return {
    agentRunId: 'run-1',
    phase: 'implement',
    featureId: 'feat-1',
    featureName: 'add-login',
    agentType: 'claude-code',
    modelId: 'claude-sonnet-4-6',
    durationMs: 1000,
    durationApiMs: 800,
    inputTokens: 100,
    outputTokens: 20,
    cacheCreationInputTokens: 5,
    cacheReadInputTokens: 50,
    costUsd: 0.5,
    numTurns: 3,
    exitCode: 'success',
    errorMessage: null,
    startedAt: new Date(NOW.getTime() - 3600_000),
    completedAt: new Date(NOW.getTime() - 3500_000),
    ...overrides,
  };
}

function repo(samples: UsageSample[]): IUsageStatsRepository {
  return { findSamplesSince: async () => samples };
}

describe('GetUsageStatsUseCase windowing', () => {
  it('asks the repository for the window the caller named', async () => {
    let asked: Date | null = null;
    const useCase = new GetUsageStatsUseCase({
      findSamplesSince: async (since) => {
        asked = since;
        return [];
      },
    });

    const result = await useCase.execute({ since: '7d', now: NOW });

    expect(asked).toEqual(new Date(NOW.getTime() - 7 * 86_400_000));
    expect(result.since).toEqual(new Date(NOW.getTime() - 7 * 86_400_000));
  });

  it('applies a default window when none was given', async () => {
    const result = await new GetUsageStatsUseCase(repo([])).execute({ now: NOW });
    expect(result.windowMs).toBeGreaterThan(0);
  });

  it('rejects an unparseable --since instead of silently widening the window', async () => {
    await expect(
      new GetUsageStatsUseCase(repo([])).execute({ since: 'forever', now: NOW })
    ).rejects.toThrow(/since/i);
  });

  it('returns an empty report rather than throwing when nothing ran', async () => {
    const result = await new GetUsageStatsUseCase(repo([])).execute({ since: '7d', now: NOW });
    expect(result.groups).toEqual([]);
    expect(result.totalPhases).toBe(0);
    expect(result.totals.costUsd).toBeNull();
  });
});

describe('GetUsageStatsUseCase grouping', () => {
  it('groups by phase and folds iteration suffixes into the base phase', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({ phase: 'implement' }),
        sample({ phase: 'implement:2' }),
        sample({ phase: 'review' }),
      ])
    ).execute({ since: '7d', by: UsageGroupBy.Phase, now: NOW });

    const implement = result.groups.find((g) => g.key === 'implement');
    expect(implement?.phases).toBe(2);
    expect(result.groups.map((g) => g.key).sort()).toEqual(['implement', 'review']);
  });

  it('groups by agent', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ agentType: 'claude-code' }), sample({ agentType: 'openrouter' })])
    ).execute({ since: '7d', by: UsageGroupBy.Agent, now: NOW });

    expect(result.groups.map((g) => g.key).sort()).toEqual(['claude-code', 'openrouter']);
  });

  it('groups by feature, preferring the feature name', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ featureName: 'add-login' }), sample({ featureName: 'fix-bug' })])
    ).execute({ since: '7d', by: UsageGroupBy.Feature, now: NOW });

    expect(result.groups.map((g) => g.key).sort()).toEqual(['add-login', 'fix-bug']);
  });

  it('groups by model', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ modelId: 'a' }), sample({ modelId: 'b' }), sample({ modelId: 'b' })])
    ).execute({ since: '7d', by: UsageGroupBy.Model, now: NOW });

    expect(result.groups.find((g) => g.key === 'b')?.phases).toBe(2);
  });

  it('labels a missing dimension rather than dropping the row', async () => {
    const result = await new GetUsageStatsUseCase(repo([sample({ agentType: null })])).execute({
      since: '7d',
      by: UsageGroupBy.Agent,
      now: NOW,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.key).toBeTruthy();
  });

  it('sorts groups by total duration so the slow one is first', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({ phase: 'fast', durationMs: 10 }),
        sample({ phase: 'slow', durationMs: 10_000 }),
      ])
    ).execute({ since: '7d', now: NOW });

    expect(result.groups[0]?.key).toBe('slow');
  });
});

describe('GetUsageStatsUseCase duration and tokens', () => {
  it('computes p50 and p95 by nearest rank', async () => {
    const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const result = await new GetUsageStatsUseCase(
      repo(durations.map((durationMs) => sample({ durationMs })))
    ).execute({ since: '7d', now: NOW });

    const group = result.groups[0]!;
    expect(group.durationP50Ms).toBe(500);
    expect(group.durationP95Ms).toBe(1000);
  });

  it('ignores rows with no recorded duration in the percentiles', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ durationMs: 100 }), sample({ durationMs: null })])
    ).execute({ since: '7d', now: NOW });

    expect(result.groups[0]?.durationP50Ms).toBe(100);
  });

  it('reports null percentiles when nothing in the group has a duration', async () => {
    const result = await new GetUsageStatsUseCase(repo([sample({ durationMs: null })])).execute({
      since: '7d',
      now: NOW,
    });
    expect(result.groups[0]?.durationP50Ms).toBeNull();
    expect(result.groups[0]?.durationP95Ms).toBeNull();
  });

  it('sums every token bucket separately and in total', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({
          inputTokens: 10,
          outputTokens: 1,
          cacheCreationInputTokens: 2,
          cacheReadInputTokens: 3,
        }),
        sample({
          inputTokens: 20,
          outputTokens: 2,
          cacheCreationInputTokens: 4,
          cacheReadInputTokens: 6,
        }),
      ])
    ).execute({ since: '7d', now: NOW });

    const group = result.groups[0]!;
    expect(group.inputTokens).toBe(30);
    expect(group.outputTokens).toBe(3);
    expect(group.cacheCreationInputTokens).toBe(6);
    expect(group.cacheReadInputTokens).toBe(9);
    // input already includes the cache buckets, so the total is input + output
    // (30 + 3), not input + output + cache (which double counted to 48).
    expect(group.totalTokens).toBe(33);
    expect(result.totals.totalTokens).toBe(33);
  });

  /**
   * Every executor that reports cache buckets already folds them into
   * inputTokens (Claude's extractUsage adds cache_creation + cache_read to
   * input_tokens; the AI SDK's inputTokens is the total with a cache
   * breakdown). The cache fields are a breakdown of input, not extra tokens.
   */
  it('counts cached input tokens once in the total', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({
          inputTokens: 100, // includes the 60 cache-read tokens below
          outputTokens: 10,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 60,
        }),
      ])
    ).execute({ since: '7d', now: NOW });

    expect(result.groups[0]!.totalTokens).toBe(110);
    expect(result.totals.totalTokens).toBe(110);
  });

  it('excludes zero-duration lifecycle rows from phase aggregation', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ phase: 'implement' }), sample({ phase: 'run:started', durationMs: 0 })])
    ).execute({ since: '7d', now: NOW });

    expect(result.groups.map((g) => g.key)).toEqual(['implement']);
    expect(result.totalPhases).toBe(1);
  });
});

describe('GetUsageStatsUseCase failure rate', () => {
  it('counts a non-success exit code as a failure', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ exitCode: 'success' }), sample({ exitCode: 'error' })])
    ).execute({ since: '7d', now: NOW });

    expect(result.groups[0]?.failures).toBe(1);
    expect(result.groups[0]?.failureRate).toBeCloseTo(0.5);
    expect(result.totals.failureRate).toBeCloseTo(0.5);
  });

  it('counts a recorded error message as a failure even with no exit code', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ exitCode: null, errorMessage: 'boom' })])
    ).execute({ since: '7d', now: NOW });

    expect(result.groups[0]?.failures).toBe(1);
  });

  it('does not count a still-running phase as a failure', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ exitCode: null, errorMessage: null, completedAt: null })])
    ).execute({ since: '7d', now: NOW });

    expect(result.groups[0]?.failures).toBe(0);
  });

  it('counts run-level failures from the lifecycle rows separately', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({ agentRunId: 'r1', phase: 'run:started', durationMs: 0 }),
        sample({ agentRunId: 'r1', phase: 'run:failed', durationMs: 0 }),
        sample({ agentRunId: 'r2', phase: 'run:started', durationMs: 0 }),
        sample({ agentRunId: 'r2', phase: 'run:completed', durationMs: 0 }),
      ])
    ).execute({ since: '7d', now: NOW });

    expect(result.runs.started).toBe(2);
    expect(result.runs.failed).toBe(1);
    expect(result.runs.completed).toBe(1);
  });
});

describe('GetUsageStatsUseCase cost honesty', () => {
  it('reports a real cost when every sample in the group reported one', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ costUsd: 0.25 }), sample({ costUsd: 0.75 })])
    ).execute({ since: '7d', now: NOW });

    const group = result.groups[0]!;
    expect(group.costUsd).toBeCloseTo(1);
    expect(group.costReported).toBe(true);
    expect(group.phasesMissingCost).toBe(0);
    expect(result.totals.costIsPartial).toBe(false);
  });

  it('reports NULL cost — not zero — for an agent that does not report cost', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({ agentType: 'openrouter', costUsd: null }),
        sample({ agentType: 'openrouter', costUsd: null }),
      ])
    ).execute({ since: '7d', by: UsageGroupBy.Agent, now: NOW });

    const group = result.groups[0]!;
    expect(group.costUsd).toBeNull();
    expect(group.costReported).toBe(false);
    expect(group.phasesMissingCost).toBe(2);
  });

  it('marks the total partial when ANY sample in the window lacks cost', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({ agentType: 'claude-code', costUsd: 1 }),
        sample({ agentType: 'openrouter', costUsd: null }),
      ])
    ).execute({ since: '7d', by: UsageGroupBy.Agent, now: NOW });

    expect(result.totals.costUsd).toBeCloseTo(1);
    expect(result.totals.costIsPartial).toBe(true);
    expect(result.totals.phasesMissingCost).toBe(1);
  });

  it('names the agents whose runs contributed no cost, so the gap is attributable', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([
        sample({ agentType: 'claude-code', costUsd: 1 }),
        sample({ agentType: 'openrouter', costUsd: null }),
        sample({ agentType: 'ollama', costUsd: null }),
      ])
    ).execute({ since: '7d', by: UsageGroupBy.Agent, now: NOW });

    expect(result.totals.agentsMissingCost.sort()).toEqual(['ollama', 'openrouter']);
  });

  it('does not derive cost from a group where only some samples reported it', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ costUsd: 1 }), sample({ costUsd: null })])
    ).execute({ since: '7d', now: NOW });

    const group = result.groups[0]!;
    expect(group.costReported).toBe(true);
    expect(group.costUsd).toBeCloseTo(1);
    // The partial-coverage count is what stops that 1.00 reading as the truth.
    expect(group.phasesMissingCost).toBe(1);
  });

  it('never reports a total of zero dollars when no cost data exists at all', async () => {
    const result = await new GetUsageStatsUseCase(
      repo([sample({ costUsd: null }), sample({ costUsd: null })])
    ).execute({ since: '7d', now: NOW });

    expect(result.totals.costUsd).toBeNull();
    expect(result.totals.costIsPartial).toBe(true);
  });
});
