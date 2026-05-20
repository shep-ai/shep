import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GetCuratedIssuesByLaneUseCase } from '@/application/use-cases/contributors/get-curated-issues-by-lane.use-case.js';
import { ContributionDifficulty, ContributorLane } from '@/domain/generated/output.js';
import type {
  ExternalIssueSummary,
  IExternalIssueFetcher,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';

const NOW = new Date('2026-05-06T12:00:00Z');

function summary(
  issueNumber: number,
  labels: readonly string[],
  lastActivityAt: string
): ExternalIssueSummary {
  return {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber,
    title: `Issue ${issueNumber}`,
    labels,
    lastActivityAt,
    url: `https://github.com/shep-ai/shep/issues/${issueNumber}`,
  };
}

function fakeFetcher(items: ExternalIssueSummary[]): IExternalIssueFetcher {
  return {
    fetchGitHubIssue: vi.fn(),
    fetchJiraTicket: vi.fn(),
    getMergedPrCount: vi.fn(),
    listIssuesByLabel: vi.fn(),
    listIssuesByLabels: vi.fn().mockResolvedValue(items),
  };
}

describe('GetCuratedIssuesByLaneUseCase', () => {
  it('queries the fetcher with the lane label intersected with good-first-issue', async () => {
    const fetcher = fakeFetcher([
      summary(1, ['good-first-issue', 'lane:docs'], '2026-05-05T00:00:00Z'),
    ]);
    const useCase = new GetCuratedIssuesByLaneUseCase(fetcher);

    const result = await useCase.execute({
      owner: 'shep-ai',
      repo: 'shep',
      lane: ContributorLane.Docs,
      now: NOW,
    });

    expect(fetcher.listIssuesByLabels).toHaveBeenCalledWith('shep-ai', 'shep', [
      'good-first-issue',
      'lane:docs',
    ]);
    expect(result.lane).toBe(ContributorLane.Docs);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      issueNumber: 1,
      lane: ContributorLane.Docs,
      difficulty: ContributionDifficulty.GoodFirst,
    });
  });

  it('excludes issues older than the stale threshold', async () => {
    const fetcher = fakeFetcher([
      summary(1, ['good-first-issue', 'lane:cli'], '2026-05-05T00:00:00Z'),
      summary(2, ['good-first-issue', 'lane:cli'], '2025-12-01T00:00:00Z'),
    ]);
    const useCase = new GetCuratedIssuesByLaneUseCase(fetcher);

    const result = await useCase.execute({
      owner: 'shep-ai',
      repo: 'shep',
      lane: ContributorLane.Cli,
      now: NOW,
    });

    expect(result.issues.map((i) => i.issueNumber)).toEqual([1]);
  });

  it('reads difficulty from existing labels when present', async () => {
    const fetcher = fakeFetcher([
      summary(7, ['good-first-issue', 'lane:agents', 'difficulty:medium'], '2026-05-05T00:00:00Z'),
    ]);
    const useCase = new GetCuratedIssuesByLaneUseCase(fetcher);

    const result = await useCase.execute({
      owner: 'shep-ai',
      repo: 'shep',
      lane: ContributorLane.Agents,
      now: NOW,
    });

    expect(result.issues[0].difficulty).toBe(ContributionDifficulty.Medium);
  });
});
