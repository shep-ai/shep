/**
 * RegenerateGoodFirstIssuesDocUseCase — spec 097.
 *
 * Rebuilds only the generated lane/difficulty buckets in
 * GOOD_FIRST_ISSUES.md from live GitHub labels. The surrounding preamble,
 * claim instructions, empty-list guidance, and related links are preserved
 * byte-for-byte. Actual file writes are supervisor-gated.
 */

import { inject, injectable } from 'tsyringe';

import { ContributionDifficulty, ContributorLane } from '../../../domain/generated/output.js';
import type {
  ExternalIssueSummary,
  IExternalIssueFetcher,
} from '../../ports/output/services/external-issue-fetcher.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { IContributorActionGate } from '../../ports/output/services/contributor-action-gate.interface.js';

export const GOOD_FIRST_ISSUE_DOC_START = '<!-- good-first-issues:start -->';
export const GOOD_FIRST_ISSUE_DOC_END = '<!-- good-first-issues:end -->';
export const GOOD_FIRST_ISSUE_LABEL = 'good first issue';

const LANES: readonly ContributorLane[] = [
  ContributorLane.Docs,
  ContributorLane.Agents,
  ContributorLane.Ui,
  ContributorLane.Cli,
  ContributorLane.Infra,
];

const DIFFICULTIES: readonly ContributionDifficulty[] = [
  ContributionDifficulty.GoodFirst,
  ContributionDifficulty.Easy,
  ContributionDifficulty.Medium,
  ContributionDifficulty.Hard,
];

const LANE_DESCRIPTIONS: Readonly<Record<ContributorLane, string>> = {
  [ContributorLane.Docs]: 'Documentation, READMEs, JSDoc, contributor docs, lessons.',
  [ContributorLane.Agents]:
    'Agent prompts, supervisor flow, agent-agnostic plumbing under `tsp/agents/`, `application/use-cases/agents/`, `infrastructure/agents/`.',
  [ContributorLane.Ui]:
    'Web dashboard under `src/presentation/web/`, Storybook stories, Playwright e2e.',
  [ContributorLane.Cli]:
    'Commander commands, terminal UX, structured output under `src/presentation/cli/`.',
  [ContributorLane.Infra]:
    'SQLite, ports/adapters, queues, schedulers, GitHub plumbing under `infrastructure/`.',
};

export interface RegenerateGoodFirstIssuesDocInput {
  owner: string;
  repo: string;
  docPath: string;
}

export type RegenerateGoodFirstIssuesDocResult =
  | { status: 'unchanged'; issueCount: number }
  | { status: 'updated'; issueCount: number }
  | { status: 'denied'; issueCount: number; rationale: string };

interface Bucket {
  lane: ContributorLane;
  difficulty: ContributionDifficulty;
  issues: readonly ExternalIssueSummary[];
}

@injectable()
export class RegenerateGoodFirstIssuesDocUseCase {
  constructor(
    @inject('IExternalIssueFetcher')
    private readonly issues: IExternalIssueFetcher,
    @inject('IFileSystemService')
    private readonly files: IFileSystemService,
    @inject('IContributorActionGate')
    private readonly gate: IContributorActionGate
  ) {}

  async execute(
    input: RegenerateGoodFirstIssuesDocInput
  ): Promise<RegenerateGoodFirstIssuesDocResult> {
    const current = await this.files.readTextFile(input.docPath);
    const buckets = await this.fetchBuckets(input.owner, input.repo);
    const generated = renderGeneratedBuckets(buckets);
    const next = replaceGeneratedRegion(current, generated);
    const issueCount = buckets.reduce((sum, bucket) => sum + bucket.issues.length, 0);

    if (next === current) {
      return { status: 'unchanged', issueCount };
    }

    const decision = await this.gate.gate({
      kind: 'good-first-issues-doc-write',
      summary: `Regenerate GOOD_FIRST_ISSUES.md for ${input.owner}/${input.repo}`,
      context: {
        owner: input.owner,
        repo: input.repo,
        docPath: input.docPath,
        issueCount,
      },
    });

    if (!decision.approved) {
      return { status: 'denied', issueCount, rationale: decision.rationale };
    }

    await this.files.writeTextFile(input.docPath, next);
    return { status: 'updated', issueCount };
  }

  private async fetchBuckets(owner: string, repo: string): Promise<Bucket[]> {
    const buckets: Bucket[] = [];
    for (const lane of LANES) {
      for (const difficulty of DIFFICULTIES) {
        const issues = await this.issues.listOpenByLabels(owner, repo, [
          GOOD_FIRST_ISSUE_LABEL,
          `lane:${lane}`,
          `difficulty:${difficulty}`,
        ]);
        buckets.push({
          lane,
          difficulty,
          issues: [...issues].sort(compareIssues),
        });
      }
    }
    return buckets;
  }
}

export function replaceGeneratedRegion(current: string, generated: string): string {
  const markerStart = current.indexOf(GOOD_FIRST_ISSUE_DOC_START);
  const markerEnd = current.indexOf(GOOD_FIRST_ISSUE_DOC_END);
  if ((markerStart === -1) !== (markerEnd === -1)) {
    throw new Error('GOOD_FIRST_ISSUES.md generated bucket markers are incomplete.');
  }

  if (markerStart !== -1 && markerEnd !== -1) {
    if (markerEnd <= markerStart) {
      throw new Error('GOOD_FIRST_ISSUES.md generated bucket markers are out of order.');
    }

    const before = current.slice(0, markerStart);
    const after = current.slice(markerEnd + GOOD_FIRST_ISSUE_DOC_END.length);
    return `${before}${GOOD_FIRST_ISSUE_DOC_START}\n\n${generated}\n\n${GOOD_FIRST_ISSUE_DOC_END}${after}`;
  }

  const fallbackStart = current.indexOf('\n## docs lane\n');
  const fallbackEnd = current.indexOf('\n---\n\n## When this list is empty');
  if (fallbackStart === -1 || fallbackEnd === -1 || fallbackEnd <= fallbackStart) {
    throw new Error('GOOD_FIRST_ISSUES.md generated bucket region was not found.');
  }

  return `${current.slice(0, fallbackStart + 1)}${GOOD_FIRST_ISSUE_DOC_START}\n\n${generated}\n\n${GOOD_FIRST_ISSUE_DOC_END}${current.slice(fallbackEnd)}`;
}

export function renderGeneratedBuckets(buckets: readonly Bucket[]): string {
  const byLaneAndDifficulty = new Map<string, readonly ExternalIssueSummary[]>();
  for (const bucket of buckets) {
    byLaneAndDifficulty.set(bucketKey(bucket.lane, bucket.difficulty), bucket.issues);
  }

  return LANES.map((lane) => renderLane(lane, byLaneAndDifficulty)).join('\n\n---\n\n');
}

function renderLane(
  lane: ContributorLane,
  byLaneAndDifficulty: ReadonlyMap<string, readonly ExternalIssueSummary[]>
): string {
  const chunks = [`## ${lane} lane`, '', `*${LANE_DESCRIPTIONS[lane]}*`];
  for (const difficulty of DIFFICULTIES) {
    chunks.push('', `### ${difficulty}`, '');
    const issues = byLaneAndDifficulty.get(bucketKey(lane, difficulty)) ?? [];
    if (issues.length === 0) {
      chunks.push('- _No curated issues right now._');
    } else {
      chunks.push(...issues.map(renderIssue));
    }
  }
  return chunks.join('\n');
}

function renderIssue(issue: ExternalIssueSummary): string {
  return `- [#${issue.issueNumber} — ${issue.title}](${issue.url})`;
}

function bucketKey(lane: ContributorLane, difficulty: ContributionDifficulty): string {
  return `${lane}:${difficulty}`;
}

function compareIssues(a: ExternalIssueSummary, b: ExternalIssueSummary): number {
  return a.issueNumber - b.issueNumber || a.title.localeCompare(b.title);
}
