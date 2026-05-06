import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { WelcomeFirstTimeContributorUseCase } from '@/application/use-cases/contributors/welcome-first-time-contributor.use-case.js';
import { ContributorLevel, RecognitionKind, type Contributor } from '@/domain/generated/output.js';
import type { IExternalIssueFetcher } from '@/application/ports/output/services/external-issue-fetcher.interface.js';
import type { IContributorRepository } from '@/application/ports/output/repositories/contributor-repository.interface.js';
import type { IRecognitionEventRepository } from '@/application/ports/output/repositories/recognition-event-repository.interface.js';
import type { IGitHubIssueWriter } from '@/application/ports/output/services/github-issue-writer.interface.js';
import type { IContributorActionGate } from '@/application/ports/output/services/contributor-action-gate.interface.js';
import type { IDesktopNotifier } from '@/application/ports/output/services/i-desktop-notifier.js';

const PR_REF = { owner: 'shep-ai', repo: 'shep', issueNumber: 99 };

function makeFetcher(mergedCount: number): IExternalIssueFetcher {
  return {
    fetchGitHubIssue: vi.fn(),
    fetchJiraTicket: vi.fn(),
    getMergedPrCount: vi.fn().mockResolvedValue(mergedCount),
    listIssuesByLabel: vi.fn(),
    listIssuesByLabels: vi.fn(),
  };
}

function makeContributorRepo(existing?: Contributor): IContributorRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findByGitHubLogin: vi.fn().mockResolvedValue(existing ?? null),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    listAll: vi.fn(),
    findTopByPrCount: vi.fn(),
  };
}

function makeEventRepo(): IRecognitionEventRepository {
  return {
    insert: vi.fn().mockResolvedValue({ inserted: true }),
    findByContributorId: vi.fn(),
    findByMonth: vi.fn(),
  };
}

function makeIssueWriter(): IGitHubIssueWriter {
  return {
    addLabels: vi.fn().mockResolvedValue(undefined),
    removeLabels: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue(undefined),
    assignUsers: vi.fn().mockResolvedValue(undefined),
  };
}

function makeGate(approved: boolean): IContributorActionGate {
  return {
    gate: vi.fn().mockResolvedValue({
      approved,
      rationale: approved ? 'auto-approved by policy' : 'awaiting maintainer review',
    }),
  };
}

function makeNotifier(): IDesktopNotifier {
  return { send: vi.fn() };
}

describe('WelcomeFirstTimeContributorUseCase', () => {
  it('treats author with zero merged PRs as first-time and posts welcome comment when gate approves', async () => {
    const fetcher = makeFetcher(0);
    const contribRepo = makeContributorRepo();
    const eventRepo = makeEventRepo();
    const writer = makeIssueWriter();
    const gate = makeGate(true);
    const notifier = makeNotifier();

    const useCase = new WelcomeFirstTimeContributorUseCase(
      fetcher,
      contribRepo,
      eventRepo,
      writer,
      gate,
      notifier
    );

    const result = await useCase.execute({
      prRef: PR_REF,
      authorLogin: 'newbie',
    });

    expect(result.firstTime).toBe(true);
    if (!result.firstTime) return;
    expect(result.contributor.githubLogin).toBe('newbie');
    expect(result.contributor.level).toBe(ContributorLevel.User);
    expect(result.recognitionEvent.kind).toBe(RecognitionKind.FirstPR);
    expect(result.recognitionEvent.prNumber).toBe(PR_REF.issueNumber);
    expect(result.commentPosted).toBe(true);
    expect(contribRepo.create).toHaveBeenCalledTimes(1);
    expect(eventRepo.insert).toHaveBeenCalledTimes(1);
    expect(writer.addComment).toHaveBeenCalledWith(PR_REF, expect.stringContaining('@newbie'));
    expect(notifier.send).toHaveBeenCalledTimes(1);
  });

  it('skips welcome comment when gate denies but still records contributor + event', async () => {
    const fetcher = makeFetcher(0);
    const contribRepo = makeContributorRepo();
    const eventRepo = makeEventRepo();
    const writer = makeIssueWriter();
    const gate = makeGate(false);
    const notifier = makeNotifier();

    const useCase = new WelcomeFirstTimeContributorUseCase(
      fetcher,
      contribRepo,
      eventRepo,
      writer,
      gate,
      notifier
    );

    const result = await useCase.execute({
      prRef: PR_REF,
      authorLogin: 'newbie',
    });

    expect(result.firstTime).toBe(true);
    if (!result.firstTime) return;
    expect(result.commentPosted).toBe(false);
    expect(writer.addComment).not.toHaveBeenCalled();
    expect(eventRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('returns firstTime=false and does nothing when author has prior merged PRs', async () => {
    const fetcher = makeFetcher(3);
    const contribRepo = makeContributorRepo();
    const eventRepo = makeEventRepo();
    const writer = makeIssueWriter();
    const gate = makeGate(true);
    const notifier = makeNotifier();

    const useCase = new WelcomeFirstTimeContributorUseCase(
      fetcher,
      contribRepo,
      eventRepo,
      writer,
      gate,
      notifier
    );

    const result = await useCase.execute({
      prRef: PR_REF,
      authorLogin: 'veteran',
    });

    expect(result.firstTime).toBe(false);
    expect(contribRepo.create).not.toHaveBeenCalled();
    expect(eventRepo.insert).not.toHaveBeenCalled();
    expect(writer.addComment).not.toHaveBeenCalled();
    expect(gate.gate).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('reuses an existing contributor instead of creating a duplicate', async () => {
    const existing: Contributor = {
      id: 'existing-id',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      githubLogin: 'newbie',
      level: ContributorLevel.User,
      firstContributionAt: '2026-01-01T00:00:00Z',
      lastContributionAt: '2026-01-01T00:00:00Z',
      prCount: 0,
      issueCount: 0,
    };
    const fetcher = makeFetcher(0);
    const contribRepo = makeContributorRepo(existing);
    const eventRepo = makeEventRepo();
    const useCase = new WelcomeFirstTimeContributorUseCase(
      fetcher,
      contribRepo,
      eventRepo,
      makeIssueWriter(),
      makeGate(true),
      makeNotifier()
    );

    const result = await useCase.execute({ prRef: PR_REF, authorLogin: 'newbie' });

    expect(result.firstTime).toBe(true);
    if (!result.firstTime) return;
    expect(result.contributor.id).toBe('existing-id');
    expect(contribRepo.create).not.toHaveBeenCalled();
  });
});
