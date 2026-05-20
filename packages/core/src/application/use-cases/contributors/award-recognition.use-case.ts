/**
 * AwardRecognitionUseCase — spec 097, FR-30 / NFR-11.
 *
 * On a PR merge event, this use case:
 *   1. Idempotently inserts a `RecognitionEvent` keyed by
 *      (contributorId, kind, prNumber). The repository enforces this via
 *      the schema-level UNIQUE constraint plus an INSERT … ON CONFLICT
 *      DO NOTHING upsert.
 *   2. When (and only when) a row was actually inserted, updates the
 *      contributor's prCount + lastContributionAt + level (if a ladder
 *      threshold was crossed) and appends to `.all-contributorsrc` via
 *      `IAllContributorsWriter`.
 *
 * Reprocessing the same `(contributorId, kind, prNumber)` triple is a
 * complete no-op: no event, no contributor mutation, no writer call.
 */

import { randomUUID } from 'node:crypto';

import { inject, injectable } from 'tsyringe';

import {
  ContributorLevel,
  RecognitionKind,
  type Contributor,
  type RecognitionEvent,
} from '../../../domain/generated/output.js';
import type { IContributorRepository } from '../../ports/output/repositories/contributor-repository.interface.js';
import type { IRecognitionEventRepository } from '../../ports/output/repositories/recognition-event-repository.interface.js';
import type { IAllContributorsWriter } from '../../ports/output/services/all-contributors-writer.interface.js';

const CONTRIBUTOR_THRESHOLD_PRS = 1;
const CORE_THRESHOLD_PRS = 5;
const MAINTAINER_THRESHOLD_PRS = 25;

/**
 * Command input for recording a recognition event for one contributor.
 */
export interface AwardRecognitionInput {
  /** Stable contributor UUID that must already exist in the contributor repository. */
  contributorId: string;
  /** Recognition category that drives idempotency and all-contributors contribution type. */
  kind: RecognitionKind;
  /** GitHub pull request number associated with PR-based recognition; repository-local count. */
  prNumber: number;
  /** ISO 8601 timestamp the recognition occurred at. Defaults to "now". */
  occurredAt?: string;
  /** Optional reference to a monthly recap (only used for MonthlyShoutout). */
  monthRecapId?: string;
}

/**
 * Outcome of an attempted recognition insert and any resulting contributor mutation.
 */
export interface AwardRecognitionResult {
  /** True only when the recognition row was newly inserted, not replayed. */
  awarded: boolean;
  /** Recognition event row — only meaningful when `awarded` is true. */
  event?: RecognitionEvent;
  /** Contributor row after any prCount/level mutation. */
  contributor?: Contributor;
}

@injectable()
export class AwardRecognitionUseCase {
  constructor(
    @inject('IContributorRepository')
    private readonly contributors: IContributorRepository,
    @inject('IRecognitionEventRepository')
    private readonly events: IRecognitionEventRepository,
    @inject('IAllContributorsWriter')
    private readonly allContributors: IAllContributorsWriter
  ) {}

  async execute(input: AwardRecognitionInput): Promise<AwardRecognitionResult> {
    const contributor = await this.contributors.findById(input.contributorId);
    if (!contributor) {
      throw new Error(`Contributor not found: ${input.contributorId}`);
    }

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const event: RecognitionEvent = {
      id: randomUUID(),
      createdAt: occurredAt,
      updatedAt: occurredAt,
      contributorId: contributor.id,
      kind: input.kind,
      occurredAt,
      prNumber: input.prNumber,
      monthRecapId: input.monthRecapId,
    };

    const { inserted } = await this.events.insert(event);
    if (!inserted) {
      return { awarded: false };
    }

    const updatedContributor = bumpContributor(contributor, input.kind, occurredAt);
    if (updatedContributor !== contributor) {
      await this.contributors.update(updatedContributor);
    }

    await this.allContributors.appendContributor({
      login: updatedContributor.githubLogin,
      contributions: contributionKindsForRecognition(input.kind),
      name: updatedContributor.displayName,
      avatarUrl: updatedContributor.avatarUrl,
    });

    return { awarded: true, event, contributor: updatedContributor };
  }
}

function bumpContributor(
  contributor: Contributor,
  kind: RecognitionKind,
  occurredAt: string
): Contributor {
  if (!isPrKind(kind)) return contributor;
  const prCount = contributor.prCount + 1;
  const level = nextLevel(contributor.level, prCount);
  return {
    ...contributor,
    prCount,
    level,
    lastContributionAt: occurredAt,
    updatedAt: occurredAt,
  };
}

function isPrKind(kind: RecognitionKind): boolean {
  return kind === RecognitionKind.FirstPR || kind === RecognitionKind.NthPR;
}

/**
 * Returns the highest contributor ladder level reached by the current level and PR count.
 */
export function nextLevel(current: ContributorLevel, prCount: number): ContributorLevel {
  if (prCount >= MAINTAINER_THRESHOLD_PRS)
    return highestLevel(current, ContributorLevel.Maintainer);
  if (prCount >= CORE_THRESHOLD_PRS) return highestLevel(current, ContributorLevel.Core);
  if (prCount >= CONTRIBUTOR_THRESHOLD_PRS) {
    return highestLevel(current, ContributorLevel.Contributor);
  }
  return current;
}

const LEVEL_ORDER: readonly ContributorLevel[] = [
  ContributorLevel.User,
  ContributorLevel.Contributor,
  ContributorLevel.Core,
  ContributorLevel.Maintainer,
];

function highestLevel(a: ContributorLevel, b: ContributorLevel): ContributorLevel {
  return LEVEL_ORDER.indexOf(a) > LEVEL_ORDER.indexOf(b) ? a : b;
}

function contributionKindsForRecognition(kind: RecognitionKind): readonly string[] {
  switch (kind) {
    case RecognitionKind.FirstPR:
    case RecognitionKind.NthPR:
      return ['code'];
    case RecognitionKind.FirstIssue:
      return ['bug'];
    case RecognitionKind.MonthlyShoutout:
      return ['ideas'];
  }
}
