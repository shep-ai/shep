import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import {
  DetectStaleGoodFirstIssueUseCase,
  GOOD_FIRST_ISSUE_LABEL,
} from '@/application/use-cases/contributors/detect-stale-good-first-issue.use-case.js';
import type {
  ExternalIssueSummary,
  IExternalIssueFetcher,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';

const NOW = new Date('2026-05-06T12:00:00Z');

function summary(issueNumber: number, lastActivityAt: string): ExternalIssueSummary {
  return {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber,
    title: `Issue ${issueNumber}`,
    labels: [GOOD_FIRST_ISSUE_LABEL],
    lastActivityAt,
    url: `https://github.com/shep-ai/shep/issues/${issueNumber}`,
  };
}

function fakeFetcher(items: ExternalIssueSummary[]): IExternalIssueFetcher {
  return {
    fetchGitHubIssue: vi.fn(),
    fetchJiraTicket: vi.fn(),
    getMergedPrCount: vi.fn(),
    listIssuesByLabel: vi.fn().mockResolvedValue(items),
    listIssuesByLabels: vi.fn(),
  };
}

describe('DetectStaleGoodFirstIssueUseCase', () => {
  it('returns only issues older than the default 30-day threshold', async () => {
    const fetcher = fakeFetcher([
      summary(1, '2026-05-06T11:00:00Z'),
      summary(2, '2026-05-01T00:00:00Z'),
      summary(3, '2026-04-01T00:00:00Z'),
      summary(4, '2025-12-01T00:00:00Z'),
    ]);
    const useCase = new DetectStaleGoodFirstIssueUseCase(fetcher);

    const result = await useCase.execute({
      owner: 'shep-ai',
      repo: 'shep',
      now: NOW,
    });

    expect(result.thresholdDays).toBe(30);
    expect(result.stale.map((i) => i.issueNumber)).toEqual([3, 4]);
    expect(fetcher.listIssuesByLabel).toHaveBeenCalledWith(
      'shep-ai',
      'shep',
      GOOD_FIRST_ISSUE_LABEL
    );
  });

  it('respects a configurable threshold', async () => {
    const fetcher = fakeFetcher([
      summary(1, '2026-05-06T11:00:00Z'),
      summary(2, '2026-05-01T00:00:00Z'),
    ]);
    const useCase = new DetectStaleGoodFirstIssueUseCase(fetcher);

    const result = await useCase.execute({
      owner: 'shep-ai',
      repo: 'shep',
      staleDays: 3,
      now: NOW,
    });

    expect(result.thresholdDays).toBe(3);
    expect(result.stale.map((i) => i.issueNumber)).toEqual([2]);
  });

  it('returns an empty list when no issue is stale', async () => {
    const fetcher = fakeFetcher([summary(1, '2026-05-06T00:00:00Z')]);
    const useCase = new DetectStaleGoodFirstIssueUseCase(fetcher);

    const result = await useCase.execute({ owner: 'a', repo: 'b', now: NOW });

    expect(result.stale).toEqual([]);
  });

  it('throws when staleDays is not a positive number', async () => {
    const useCase = new DetectStaleGoodFirstIssueUseCase(fakeFetcher([]));
    await expect(useCase.execute({ owner: 'a', repo: 'b', staleDays: 0 })).rejects.toThrow(
      /positive/i
    );
  });
});
