/**
 * GroomIssueUseCase — spec 097, FR-25.
 *
 * Composes `ClassifyIntoLaneUseCase` and `ProposeAcceptanceCriteriaUseCase`
 * over a fetched issue to produce a structured grooming recommendation:
 *
 *   { lane, difficulty, acceptanceCriteria, suggestedLabels[], welcomeComment }
 *
 * Pure: NO side-effects. Callers (CLI commands, GitHub Actions handlers,
 * web routes) decide whether to apply the result via `IGitHubIssueWriter`,
 * gated through `IContributorActionGate` (NFR-5).
 */

import { inject, injectable } from 'tsyringe';

import { ContributionDifficulty, ContributorLane } from '../../../domain/generated/output.js';
import type { IExternalIssueFetcher } from '../../ports/output/services/external-issue-fetcher.interface.js';
import { ClassifyIntoLaneUseCase } from './classify-into-lane.use-case.js';
import { ProposeAcceptanceCriteriaUseCase } from './propose-acceptance-criteria.use-case.js';

const DIFFICULTY_LABEL_HINTS: readonly (readonly [string, ContributionDifficulty])[] = [
  ['good-first-issue', ContributionDifficulty.GoodFirst],
  ['good first issue', ContributionDifficulty.GoodFirst],
  ['easy', ContributionDifficulty.Easy],
  ['medium', ContributionDifficulty.Medium],
  ['hard', ContributionDifficulty.Hard],
];

/**
 * GitHub issue reference to fetch and groom for newcomer readiness.
 */
export interface GroomIssueInput {
  /** GitHub issue reference accepted by `IExternalIssueFetcher.fetchGitHubIssue`. */
  ref: string;
}

/**
 * Pure grooming recommendation for labels, criteria, and optional welcome copy.
 */
export interface GroomIssueResult {
  /** Recommended contributor lane for the issue. */
  lane: ContributorLane;
  /** Recommended issue difficulty based on labels and body heuristics. */
  difficulty: ContributionDifficulty;
  /** Markdown checklist (joined with newlines). */
  acceptanceCriteria: string;
  /** Labels that should be applied (lane + difficulty + carried-forward labels). */
  suggestedLabels: readonly string[];
  /** Optional welcome comment body when the issue looks good-first. */
  welcomeComment?: string;
}

@injectable()
export class GroomIssueUseCase {
  constructor(
    @inject('IExternalIssueFetcher')
    private readonly fetcher: IExternalIssueFetcher,
    @inject(ClassifyIntoLaneUseCase)
    private readonly classifyIntoLane: ClassifyIntoLaneUseCase,
    @inject(ProposeAcceptanceCriteriaUseCase)
    private readonly proposeCriteria: ProposeAcceptanceCriteriaUseCase
  ) {}

  async execute(input: GroomIssueInput): Promise<GroomIssueResult> {
    const issue = await this.fetcher.fetchGitHubIssue(input.ref);
    const existingLabels = issue.labels.map((l) => l.toLowerCase());

    const lane = await this.classifyIntoLane.execute({
      title: issue.title,
      body: issue.description,
      existingLabels,
    });

    const criteria = await this.proposeCriteria.execute({
      title: issue.title,
      body: issue.description,
    });

    const difficulty = inferDifficulty(existingLabels, issue.description);
    const suggestedLabels = mergeSuggestedLabels(existingLabels, lane.lane, difficulty);
    const welcomeComment =
      difficulty === ContributionDifficulty.GoodFirst ? renderWelcomeComment(lane.lane) : undefined;

    return {
      lane: lane.lane,
      difficulty,
      acceptanceCriteria: criteria.markdown,
      suggestedLabels,
      welcomeComment,
    };
  }
}

function inferDifficulty(existingLabels: readonly string[], body: string): ContributionDifficulty {
  for (const [hint, difficulty] of DIFFICULTY_LABEL_HINTS) {
    if (existingLabels.includes(hint)) return difficulty;
  }
  const codeBlockCount = (body.match(/```/g) ?? []).length / 2;
  const fileMentions = (body.match(/`[^`]+\.(ts|tsx|md|yml|yaml|json)`/g) ?? []).length;
  if (codeBlockCount === 0 && fileMentions <= 1 && body.length < 600) {
    return ContributionDifficulty.Easy;
  }
  if (fileMentions >= 3 || body.length > 2000) return ContributionDifficulty.Hard;
  return ContributionDifficulty.Medium;
}

function mergeSuggestedLabels(
  existing: readonly string[],
  lane: ContributorLane,
  difficulty: ContributionDifficulty
): readonly string[] {
  const merged = new Set<string>(existing);
  merged.add(`lane:${lane}`);
  merged.add(`difficulty:${difficulty}`);
  return [...merged];
}

function renderWelcomeComment(lane: ContributorLane): string {
  return [
    `Hey there 👋 — this is a good first issue in the **${lane}** lane.`,
    '',
    'A few quick links to get you started:',
    '- `CONTRIBUTING.md` covers the 30-second setup.',
    '- `shep doctor` validates your local environment.',
    '- Drop a comment here and a maintainer will assign it to you.',
  ].join('\n');
}
