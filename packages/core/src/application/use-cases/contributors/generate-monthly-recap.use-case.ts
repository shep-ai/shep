/**
 * GenerateMonthlyRecapUseCase — spec 097, FR-31.
 *
 * For a given UTC `YYYY-MM` bucket, gathers recognition events + the
 * contributors involved and produces a markdown recap artifact. Pure: no
 * publishing, no side-effects. The artifact is the single source of
 * truth that `PublishMonthlyRecapUseCase` fans out across channels.
 */

import { inject, injectable } from 'tsyringe';

import {
  ContributorLane,
  RecognitionKind,
  type Contributor,
  type RecognitionEvent,
} from '../../../domain/generated/output.js';
import type { IContributorRepository } from '../../ports/output/repositories/contributor-repository.interface.js';
import type { IRecognitionEventRepository } from '../../ports/output/repositories/recognition-event-repository.interface.js';
import type { RecapArtifact } from '../../ports/output/services/recap-publisher.interface.js';

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Query parameters for building a contributor recap for one UTC month.
 */
export interface GenerateMonthlyRecapInput {
  /** UTC year-month bucket (e.g. `2026-04`). */
  yearMonth: string;
  /** Title prefix; defaults to "Shep". */
  projectName?: string;
}

/**
 * Aggregate counters and highlights computed for a monthly contributor recap.
 */
export interface RecapStats {
  /** Count of recognition events included in the month. */
  totalEvents: number;
  /** Count of first-PR or first-issue recognitions in the month. */
  newContributors: number;
  /** Count of PR-based recognitions in the month. */
  prsRecognized: number;
  /** Lane with the most recognized contributors, when contributors have lane data. */
  topLane?: ContributorLane;
  /** GitHub login with the most recognition events in the month. */
  topContributorLogin?: string;
}

/**
 * Rendered recap artifact plus the stats used to produce and summarize it.
 */
export interface GenerateMonthlyRecapResult {
  /** Markdown recap artifact ready for downstream publishers. */
  artifact: RecapArtifact;
  /** Aggregate statistics for dashboard display and recap metadata. */
  stats: RecapStats;
}

@injectable()
export class GenerateMonthlyRecapUseCase {
  constructor(
    @inject('IContributorRepository')
    private readonly contributors: IContributorRepository,
    @inject('IRecognitionEventRepository')
    private readonly events: IRecognitionEventRepository
  ) {}

  async execute(input: GenerateMonthlyRecapInput): Promise<GenerateMonthlyRecapResult> {
    if (!YEAR_MONTH_PATTERN.test(input.yearMonth)) {
      throw new Error(`Invalid yearMonth: "${input.yearMonth}"; expected YYYY-MM.`);
    }

    const events = await this.events.findByMonth(input.yearMonth);
    const contributorIds = new Set(events.map((e) => e.contributorId));
    const contributorList: Contributor[] = [];
    for (const id of contributorIds) {
      const contributor = await this.contributors.findById(id);
      if (contributor) contributorList.push(contributor);
    }

    const stats = computeStats(events, contributorList);
    const artifact = renderArtifact(input, events, contributorList, stats);
    return { artifact, stats };
  }
}

function computeStats(
  events: readonly RecognitionEvent[],
  contributors: readonly Contributor[]
): RecapStats {
  const newContributors = events.filter(
    (e) => e.kind === RecognitionKind.FirstPR || e.kind === RecognitionKind.FirstIssue
  ).length;
  const prsRecognized = events.filter(
    (e) => e.kind === RecognitionKind.FirstPR || e.kind === RecognitionKind.NthPR
  ).length;

  const laneCounts = new Map<ContributorLane, number>();
  for (const c of contributors) {
    if (!c.lane) continue;
    laneCounts.set(c.lane, (laneCounts.get(c.lane) ?? 0) + 1);
  }
  const topLane = pickTop(laneCounts);

  const eventsByContributor = new Map<string, number>();
  for (const e of events) {
    eventsByContributor.set(e.contributorId, (eventsByContributor.get(e.contributorId) ?? 0) + 1);
  }
  const topContributorId = pickTop(eventsByContributor);
  const topContributorLogin = topContributorId
    ? contributors.find((c) => c.id === topContributorId)?.githubLogin
    : undefined;

  return {
    totalEvents: events.length,
    newContributors,
    prsRecognized,
    topLane,
    topContributorLogin,
  };
}

function pickTop<K>(counts: Map<K, number>): K | undefined {
  let bestKey: K | undefined;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey;
}

function renderArtifact(
  input: GenerateMonthlyRecapInput,
  events: readonly RecognitionEvent[],
  contributors: readonly Contributor[],
  stats: RecapStats
): RecapArtifact {
  const project = input.projectName ?? 'Shep';
  const title = `${project} — ${input.yearMonth} contributor recap`;
  const lines: string[] = [
    `# ${title}`,
    '',
    `_${stats.totalEvents} recognition events · ${stats.newContributors} new contributor(s) · ${stats.prsRecognized} PR(s) recognized_`,
    '',
  ];

  if (stats.topLane) {
    lines.push(`**Most active lane:** \`${stats.topLane}\``);
  }
  if (stats.topContributorLogin) {
    lines.push(`**Top contributor:** @${stats.topContributorLogin}`);
  }

  lines.push('', '## Contributors', '');
  if (contributors.length === 0) {
    lines.push('_No recognized contributors this month._');
  } else {
    for (const c of [...contributors].sort((a, b) => a.githubLogin.localeCompare(b.githubLogin))) {
      const lane = c.lane ? ` · \`${c.lane}\`` : '';
      lines.push(`- @${c.githubLogin}${lane}`);
    }
  }

  lines.push('', '## Highlights', '');
  if (events.length === 0) {
    lines.push('_No recognition events this month._');
  } else {
    for (const e of [...events].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    )) {
      lines.push(`- ${describeEvent(e, contributors)}`);
    }
  }

  return {
    recapId: input.yearMonth,
    title,
    body: lines.join('\n'),
    periodStartIso: `${input.yearMonth}-01T00:00:00.000Z`,
  };
}

function describeEvent(event: RecognitionEvent, contributors: readonly Contributor[]): string {
  const contributor = contributors.find((c) => c.id === event.contributorId);
  const who = contributor ? `@${contributor.githubLogin}` : 'a contributor';
  switch (event.kind) {
    case RecognitionKind.FirstPR:
      return `${who} merged their first PR (#${event.prNumber}).`;
    case RecognitionKind.NthPR:
      return `${who} merged PR #${event.prNumber}.`;
    case RecognitionKind.FirstIssue:
      return `${who} opened their first issue.`;
    case RecognitionKind.MonthlyShoutout:
      return `${who} earned a monthly shoutout.`;
  }
}
