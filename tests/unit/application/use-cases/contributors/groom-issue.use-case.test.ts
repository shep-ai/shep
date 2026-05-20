import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GroomIssueUseCase } from '@/application/use-cases/contributors/groom-issue.use-case.js';
import type { ClassifyIntoLaneUseCase } from '@/application/use-cases/contributors/classify-into-lane.use-case.js';
import type { ProposeAcceptanceCriteriaUseCase } from '@/application/use-cases/contributors/propose-acceptance-criteria.use-case.js';
import { ContributionDifficulty, ContributorLane } from '@/domain/generated/output.js';
import type {
  ExternalIssue,
  IExternalIssueFetcher,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';

function fetcherReturning(issue: ExternalIssue): IExternalIssueFetcher {
  return {
    fetchGitHubIssue: vi.fn().mockResolvedValue(issue),
    fetchJiraTicket: vi.fn(),
    getMergedPrCount: vi.fn(),
    listIssuesByLabel: vi.fn(),
    listIssuesByLabels: vi.fn(),
  };
}

function fakeClassifier(lane: ContributorLane): ClassifyIntoLaneUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      lane,
      source: 'rules',
      rationale: 'test rationale',
    }),
  } as unknown as ClassifyIntoLaneUseCase;
}

function fakeCriteriaProposer(): ProposeAcceptanceCriteriaUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      criteria: ['- [ ] First', '- [ ] Second'],
      markdown: '- [ ] First\n- [ ] Second',
    }),
  } as unknown as ProposeAcceptanceCriteriaUseCase;
}

const SAMPLE_ISSUE: ExternalIssue = {
  title: 'docs: clarify install steps',
  description: 'README is missing pnpm install instructions.',
  labels: ['help-wanted'],
  url: 'https://github.com/shep-ai/shep/issues/42',
  source: 'github',
};

describe('GroomIssueUseCase', () => {
  it('returns the composed grooming result with no side-effects', async () => {
    const fetcher = fetcherReturning(SAMPLE_ISSUE);
    const classifier = fakeClassifier(ContributorLane.Docs);
    const criteria = fakeCriteriaProposer();
    const useCase = new GroomIssueUseCase(fetcher, classifier, criteria);

    const result = await useCase.execute({ ref: 'shep-ai/shep#42' });

    expect(result.lane).toBe(ContributorLane.Docs);
    expect(result.acceptanceCriteria).toContain('- [ ]');
    expect(result.suggestedLabels).toEqual(
      expect.arrayContaining(['help-wanted', 'lane:docs', `difficulty:${result.difficulty}`])
    );
    expect(fetcher.fetchGitHubIssue).toHaveBeenCalledWith('shep-ai/shep#42');
  });

  it('marks issues with the good-first-issue label as goodFirst difficulty and emits welcome comment', async () => {
    const issue: ExternalIssue = {
      ...SAMPLE_ISSUE,
      labels: ['good-first-issue', 'help-wanted'],
    };
    const useCase = new GroomIssueUseCase(
      fetcherReturning(issue),
      fakeClassifier(ContributorLane.Docs),
      fakeCriteriaProposer()
    );

    const result = await useCase.execute({ ref: 'shep-ai/shep#42' });

    expect(result.difficulty).toBe(ContributionDifficulty.GoodFirst);
    expect(result.welcomeComment).toBeTruthy();
    expect(result.welcomeComment).toContain('docs');
  });

  it('infers easy difficulty for short bodies without code blocks', async () => {
    const issue: ExternalIssue = {
      ...SAMPLE_ISSUE,
      description: 'Tiny tweak.',
      labels: [],
    };
    const useCase = new GroomIssueUseCase(
      fetcherReturning(issue),
      fakeClassifier(ContributorLane.Docs),
      fakeCriteriaProposer()
    );
    const result = await useCase.execute({ ref: '#1' });
    expect(result.difficulty).toBe(ContributionDifficulty.Easy);
  });
});
