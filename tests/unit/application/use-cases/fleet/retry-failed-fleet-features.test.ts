/**
 * RetryFailedFleetFeaturesUseCase Unit Tests
 *
 * `shep fleet retry` is a projection: it reads the triage feed the operator is
 * already looking at, filters it, and drives each selected feature through the
 * EXISTING `ResumeFeatureUseCase`. It invents no second resume path — the whole
 * value is that "retry the 3 that failed CI" is one command instead of three.
 *
 * Properties that matter:
 *  - `--ci` and `--failed` select disjoint, correct categories
 *  - a feature appears ONCE even when the feed lists it more than once
 *  - one failing resume does not strand the rest of the batch
 *  - a fleet whose admission queue is parked says so, rather than appearing to
 *    succeed while admitting nothing
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RetryFailedFleetFeaturesUseCase } from '@/application/use-cases/fleet/retry-failed-fleet-features.use-case.js';
import { FleetTriageCategory, FleetTriagePriority } from '@/domain/generated/output.js';
import type { FleetTriageItem } from '@/domain/generated/output.js';

function item(
  featureId: string,
  category: FleetTriageCategory,
  overrides: Partial<FleetTriageItem> = {}
): FleetTriageItem {
  return {
    featureId,
    featureName: `Feature ${featureId}`,
    slug: `feat-${featureId}`,
    priority: FleetTriagePriority.p2,
    category,
    reason: `${category} happened`,
    createdAt: '2026-03-01T12:00:00Z',
    ...overrides,
  };
}

describe('RetryFailedFleetFeaturesUseCase', () => {
  let triage: { execute: ReturnType<typeof vi.fn> };
  let resume: { execute: ReturnType<typeof vi.fn> };
  let useCase: RetryFailedFleetFeaturesUseCase;

  beforeEach(() => {
    triage = { execute: vi.fn().mockResolvedValue([]) };
    resume = {
      execute: vi.fn().mockResolvedValue({
        feature: { id: 'f1' },
        newRun: { id: 'r-new' },
      }),
    };
    useCase = new RetryFailedFleetFeaturesUseCase(triage as never, resume as never);
  });

  describe('selection', () => {
    it('retries only CI-failed features for --ci', async () => {
      triage.execute.mockResolvedValue([
        item('ci-1', FleetTriageCategory.ci_failed),
        item('crash-1', FleetTriageCategory.crash),
        item('gate-1', FleetTriageCategory.gate),
      ]);

      const result = await useCase.execute({ scope: 'ci' });

      expect(result.retriedFeatureIds).toEqual(['ci-1']);
      expect(resume.execute).toHaveBeenCalledOnce();
      expect(resume.execute).toHaveBeenCalledWith('ci-1');
    });

    it('retries only crashed runs for --failed', async () => {
      triage.execute.mockResolvedValue([
        item('ci-1', FleetTriageCategory.ci_failed),
        item('crash-1', FleetTriageCategory.crash),
      ]);

      const result = await useCase.execute({ scope: 'failed' });

      expect(result.retriedFeatureIds).toEqual(['crash-1']);
    });

    it('never retries a gate or question, whatever the scope', async () => {
      // Those are decisions for a human, not failures to re-run. Approving them
      // is `fleet approve`; re-running them would bypass the gate entirely.
      triage.execute.mockResolvedValue([
        item('gate-1', FleetTriageCategory.gate),
        item('question-1', FleetTriageCategory.question),
        item('conflict-1', FleetTriageCategory.conflict),
        item('warn-1', FleetTriageCategory.warning),
      ]);

      expect((await useCase.execute({ scope: 'ci' })).retriedFeatureIds).toEqual([]);
      expect((await useCase.execute({ scope: 'failed' })).retriedFeatureIds).toEqual([]);
      expect(resume.execute).not.toHaveBeenCalled();
    });

    it('retries each feature once even when the feed lists it twice', async () => {
      // A feature can hold several triage items at once (a crash AND a failing
      // CI check on its PR). Retrying it twice would spawn two agents in one
      // worktree on one branch — the exact race `claimSlot` exists to prevent.
      triage.execute.mockResolvedValue([
        item('dup-1', FleetTriageCategory.crash),
        item('dup-1', FleetTriageCategory.crash, { reason: 'again' }),
      ]);

      const result = await useCase.execute({ scope: 'failed' });

      expect(result.retriedFeatureIds).toEqual(['dup-1']);
      expect(resume.execute).toHaveBeenCalledOnce();
    });

    it('retries nothing when the feed is empty', async () => {
      const result = await useCase.execute({ scope: 'ci' });

      expect(result).toMatchObject({ attemptedCount: 0, retriedFeatureIds: [], failures: [] });
      expect(resume.execute).not.toHaveBeenCalled();
    });

    it('passes the repository scope through to the feed', async () => {
      await useCase.execute({ scope: 'failed', repositoryPath: '/repo/alpha' });

      expect(triage.execute).toHaveBeenCalledWith({ repositoryPath: '/repo/alpha' });
    });
  });

  describe('isolation', () => {
    it('keeps retrying the rest when one resume throws', async () => {
      triage.execute.mockResolvedValue([
        item('a', FleetTriageCategory.crash),
        item('b', FleetTriageCategory.crash),
        item('c', FleetTriageCategory.crash),
      ]);
      resume.execute
        .mockResolvedValueOnce({ feature: { id: 'a' }, newRun: { id: 'ra' } })
        .mockRejectedValueOnce(new Error('Agent is still running — stop it first before resuming'))
        .mockResolvedValueOnce({ feature: { id: 'c' }, newRun: { id: 'rc' } });

      const result = await useCase.execute({ scope: 'failed' });

      expect(result.retriedFeatureIds).toEqual(['a', 'c']);
      expect(result.attemptedCount).toBe(3);
      expect(result.failures).toEqual([
        {
          featureId: 'b',
          featureName: 'Feature b',
          reason: expect.stringContaining('still running'),
        },
      ]);
    });

    it('reports a failure without throwing when every resume fails', async () => {
      triage.execute.mockResolvedValue([item('a', FleetTriageCategory.crash)]);
      resume.execute.mockRejectedValue(new Error('boom'));

      const result = await useCase.execute({ scope: 'failed' });

      expect(result.retriedFeatureIds).toEqual([]);
      expect(result.failures).toHaveLength(1);
    });
  });

  /**
   * NOTE for the follow-up: while the admission queue is parked, `claimSlot`
   * refuses every resume in the batch, so the operator gets N identical
   * cap-shaped messages ("raise the limit") that raising the limit cannot fix.
   * That belongs with the web pause surface and `describeRefusedClaim`, on the
   * branch that introduces the pause — deliberately NOT here, so this command
   * does not depend on unmerged work.
   */
  it('surfaces the underlying refusal reason verbatim', async () => {
    // The reason `ResumeFeatureUseCase` gives is already the most specific thing
    // known about why a feature could not restart; re-wording it here would
    // throw that away.
    triage.execute.mockResolvedValue([item('a', FleetTriageCategory.crash)]);
    resume.execute.mockRejectedValue(new Error('Feature "a" is missing specPath — cannot resume'));

    const result = await useCase.execute({ scope: 'failed' });

    expect(result.failures[0]?.reason).toBe('Feature "a" is missing specPath — cannot resume');
  });
});
