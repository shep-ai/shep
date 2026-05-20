import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import {
  GOOD_FIRST_ISSUE_DOC_END,
  GOOD_FIRST_ISSUE_DOC_START,
  GOOD_FIRST_ISSUE_LABEL,
  RegenerateGoodFirstIssuesDocUseCase,
  replaceGeneratedRegion,
} from '@/application/use-cases/contributors/regenerate-good-first-issues-doc.use-case.js';
import type {
  ExternalIssueSummary,
  IExternalIssueFetcher,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { IContributorActionGate } from '@/application/ports/output/services/contributor-action-gate.interface.js';

const DOC_PATH = '/repo/GOOD_FIRST_ISSUES.md';

function docWithBuckets(bucketRegion: string): string {
  return [
    '# Good First Issues',
    '',
    'Preamble stays exactly as written.',
    '',
    '---',
    '',
    '## How to claim',
    '',
    '1. Comment `/claim`.',
    '',
    GOOD_FIRST_ISSUE_DOC_START,
    '',
    bucketRegion,
    '',
    GOOD_FIRST_ISSUE_DOC_END,
    '',
    '---',
    '',
    '## When this list is empty',
    '',
    'Search the live tracker.',
    '',
    '---',
    '',
    '## Related',
    '',
    '- [CONTRIBUTING.md](./CONTRIBUTING.md)',
    '',
  ].join('\n');
}

function summary(
  issueNumber: number,
  title: string,
  labels: readonly string[]
): ExternalIssueSummary {
  return {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber,
    title,
    labels,
    lastActivityAt: '2026-05-20T00:00:00Z',
    url: `https://github.com/shep-ai/shep/issues/${issueNumber}`,
  };
}

function makeFetcher(itemsByLabels: Record<string, ExternalIssueSummary[]>): IExternalIssueFetcher {
  return {
    fetchGitHubIssue: vi.fn(),
    fetchJiraTicket: vi.fn(),
    getMergedPrCount: vi.fn(),
    listIssuesByLabel: vi.fn(),
    listIssuesByLabels: vi.fn(),
    listOpenByLabels: vi.fn((_owner: string, _repo: string, labels: readonly string[]) => {
      return Promise.resolve(itemsByLabels[labels.join('|')] ?? []);
    }),
  };
}

function makeFiles(initial: string): IFileSystemService {
  return {
    readTextFile: vi.fn().mockResolvedValue(initial),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    removeDirectory: vi.fn(),
    pathExists: vi.fn().mockReturnValue(true),
  };
}

function makeGate(approved: boolean): IContributorActionGate {
  return {
    gate: vi.fn().mockResolvedValue({
      approved,
      rationale: approved ? 'autonomous' : 'needs maintainer review',
    }),
  };
}

describe('RegenerateGoodFirstIssuesDocUseCase', () => {
  it('queries live issues for every lane and difficulty label bucket', async () => {
    const fetcher = makeFetcher({});
    const files = makeFiles(docWithBuckets('old buckets'));
    const gate = makeGate(true);
    const useCase = new RegenerateGoodFirstIssuesDocUseCase(fetcher, files, gate);

    await useCase.execute({ owner: 'shep-ai', repo: 'shep', docPath: DOC_PATH });

    expect(fetcher.listOpenByLabels).toHaveBeenCalledWith('shep-ai', 'shep', [
      GOOD_FIRST_ISSUE_LABEL,
      'lane:docs',
      'difficulty:goodFirst',
    ]);
    expect(fetcher.listOpenByLabels).toHaveBeenCalledWith('shep-ai', 'shep', [
      GOOD_FIRST_ISSUE_LABEL,
      'lane:infra',
      'difficulty:hard',
    ]);
    expect(fetcher.listOpenByLabels).toHaveBeenCalledTimes(20);
  });

  it('rewrites only the generated bucket region and preserves surrounding markdown', async () => {
    const current = docWithBuckets('old buckets');
    const fetcher = makeFetcher({
      [`${GOOD_FIRST_ISSUE_LABEL}|lane:docs|difficulty:goodFirst`]: [
        summary(616, 'add JSDoc to contributor use cases', [
          GOOD_FIRST_ISSUE_LABEL,
          'lane:docs',
          'difficulty:goodFirst',
        ]),
      ],
    });
    const files = makeFiles(current);
    const gate = makeGate(true);
    const useCase = new RegenerateGoodFirstIssuesDocUseCase(fetcher, files, gate);

    const result = await useCase.execute({ owner: 'shep-ai', repo: 'shep', docPath: DOC_PATH });

    expect(result).toEqual({ status: 'updated', issueCount: 1 });
    expect(files.writeTextFile).toHaveBeenCalledTimes(1);
    const next = vi.mocked(files.writeTextFile).mock.calls[0][1];
    expect(next).toContain('Preamble stays exactly as written.');
    expect(next).toContain('1. Comment `/claim`.');
    expect(next).toContain('- [CONTRIBUTING.md](./CONTRIBUTING.md)');
    expect(next).toContain(
      '- [#616 — add JSDoc to contributor use cases](https://github.com/shep-ai/shep/issues/616)'
    );
    expect(next).not.toContain('old buckets');
  });

  it('does not gate or write when regenerated content is unchanged', async () => {
    const fetcher = makeFetcher({});
    const files = makeFiles(docWithBucketsWithNoIssues());
    const gate = makeGate(true);
    const useCase = new RegenerateGoodFirstIssuesDocUseCase(fetcher, files, gate);

    const result = await useCase.execute({ owner: 'shep-ai', repo: 'shep', docPath: DOC_PATH });

    expect(result).toEqual({ status: 'unchanged', issueCount: 0 });
    expect(gate.gate).not.toHaveBeenCalled();
    expect(files.writeTextFile).not.toHaveBeenCalled();
  });

  it('short-circuits the write when the supervisor gate denies it', async () => {
    const fetcher = makeFetcher({});
    const files = makeFiles(docWithBuckets('old buckets'));
    const gate = makeGate(false);
    const useCase = new RegenerateGoodFirstIssuesDocUseCase(fetcher, files, gate);

    const result = await useCase.execute({ owner: 'shep-ai', repo: 'shep', docPath: DOC_PATH });

    expect(result).toEqual({
      status: 'denied',
      issueCount: 0,
      rationale: 'needs maintainer review',
    });
    expect(gate.gate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'good-first-issues-doc-write',
        summary: 'Regenerate GOOD_FIRST_ISSUES.md for shep-ai/shep',
      })
    );
    expect(files.writeTextFile).not.toHaveBeenCalled();
  });

  it('rejects generated bucket markers that are out of order', () => {
    expect(() =>
      replaceGeneratedRegion(
        `${GOOD_FIRST_ISSUE_DOC_END}\n\n## docs lane\n\n${GOOD_FIRST_ISSUE_DOC_START}`,
        'generated'
      )
    ).toThrow(/out of order/);
  });

  it('rejects generated bucket markers when only one marker exists', () => {
    expect(() =>
      replaceGeneratedRegion(`${GOOD_FIRST_ISSUE_DOC_START}\n\n## docs lane`, 'generated')
    ).toThrow(/incomplete/);
  });
});

function docWithBucketsWithNoIssues(): string {
  const lanes = ['docs', 'agents', 'ui', 'cli', 'infra'];
  const difficulties = ['goodFirst', 'easy', 'medium', 'hard'];
  const descriptions: Record<string, string> = {
    docs: 'Documentation, READMEs, JSDoc, contributor docs, lessons.',
    agents:
      'Agent prompts, supervisor flow, agent-agnostic plumbing under `tsp/agents/`, `application/use-cases/agents/`, `infrastructure/agents/`.',
    ui: 'Web dashboard under `src/presentation/web/`, Storybook stories, Playwright e2e.',
    cli: 'Commander commands, terminal UX, structured output under `src/presentation/cli/`.',
    infra: 'SQLite, ports/adapters, queues, schedulers, GitHub plumbing under `infrastructure/`.',
  };
  const region = lanes
    .map((lane) => {
      const chunks = [`## ${lane} lane`, '', `*${descriptions[lane]}*`];
      for (const difficulty of difficulties) {
        chunks.push('', `### ${difficulty}`, '', '- _No curated issues right now._');
      }
      return chunks.join('\n');
    })
    .join('\n\n---\n\n');
  return docWithBuckets(region);
}
