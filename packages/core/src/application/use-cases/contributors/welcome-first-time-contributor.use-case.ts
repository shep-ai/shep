/**
 * WelcomeFirstTimeContributorUseCase — spec 097, FR-28.
 *
 * Triggered on `pull_request.opened`. If the PR opener has zero prior
 * merged PRs in the target repository:
 *   1. Upsert a `Contributor` row (idempotent on github_login).
 *   2. Emit a `RecognitionEvent` of kind `firstPR` (idempotent on
 *      (contributor_id, kind, pr_number) — see NFR-11 / FR-22).
 *   3. Generate a welcome comment.
 *   4. Gate the comment via `IContributorActionGate` and post via
 *      `IGitHubIssueWriter` only when approved (NFR-5).
 *   5. Fire a desktop notification so a maintainer notices the PR.
 *
 * Non-first-timers are a no-op — the use case returns early without
 * writing or notifying.
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
import type {
  IGitHubIssueWriter,
  IssueRef,
} from '../../ports/output/services/github-issue-writer.interface.js';
import type { IContributorActionGate } from '../../ports/output/services/contributor-action-gate.interface.js';
import type { IExternalIssueFetcher } from '../../ports/output/services/external-issue-fetcher.interface.js';
import type { IDesktopNotifier } from '../../ports/output/services/i-desktop-notifier.js';

export interface WelcomeFirstTimeContributorInput {
  /** Pull-request reference. `issueNumber` is the PR number. */
  prRef: IssueRef;
  /** GitHub login of the PR opener. */
  authorLogin: string;
  /** Optional public display name. */
  authorDisplayName?: string;
  /** Optional avatar URL from the PR opener's profile. */
  authorAvatarUrl?: string;
}

export type WelcomeFirstTimeContributorResult =
  | { firstTime: false }
  | {
      firstTime: true;
      contributor: Contributor;
      recognitionEvent: RecognitionEvent;
      commentPosted: boolean;
      gateRationale: string;
    };

@injectable()
export class WelcomeFirstTimeContributorUseCase {
  constructor(
    @inject('IExternalIssueFetcher')
    private readonly fetcher: IExternalIssueFetcher,
    @inject('IContributorRepository')
    private readonly contributors: IContributorRepository,
    @inject('IRecognitionEventRepository')
    private readonly events: IRecognitionEventRepository,
    @inject('IGitHubIssueWriter')
    private readonly issueWriter: IGitHubIssueWriter,
    @inject('IContributorActionGate')
    private readonly gate: IContributorActionGate,
    @inject('IDesktopNotifier')
    private readonly notifier: IDesktopNotifier
  ) {}

  async execute(
    input: WelcomeFirstTimeContributorInput
  ): Promise<WelcomeFirstTimeContributorResult> {
    const mergedCount = await this.fetcher.getMergedPrCount(
      input.prRef.owner,
      input.prRef.repo,
      input.authorLogin
    );
    if (mergedCount > 0) return { firstTime: false };

    const contributor = await this.upsertContributor(input);
    const recognitionEvent = await this.recordFirstPr(contributor.id, input.prRef.issueNumber);

    const commentBody = renderWelcomeComment(input.authorLogin);
    const gateDecision = await this.gate.gate({
      kind: 'github-comment',
      summary: `Welcome comment for first-time contributor @${input.authorLogin} on PR #${input.prRef.issueNumber}`,
      context: { login: input.authorLogin, prNumber: input.prRef.issueNumber },
    });

    let commentPosted = false;
    if (gateDecision.approved) {
      await this.issueWriter.addComment(input.prRef, commentBody);
      commentPosted = true;
    }

    this.notifier.send(
      'New first-time contributor 🎉',
      `@${input.authorLogin} opened PR #${input.prRef.issueNumber} in ${input.prRef.owner}/${input.prRef.repo}.`
    );

    return {
      firstTime: true,
      contributor,
      recognitionEvent,
      commentPosted,
      gateRationale: gateDecision.rationale,
    };
  }

  private async upsertContributor(input: WelcomeFirstTimeContributorInput): Promise<Contributor> {
    const existing = await this.contributors.findByGitHubLogin(input.authorLogin);
    const nowIso = new Date().toISOString();
    if (existing) return existing;

    const fresh: Contributor = {
      id: randomUUID(),
      createdAt: nowIso,
      updatedAt: nowIso,
      githubLogin: input.authorLogin,
      displayName: input.authorDisplayName,
      avatarUrl: input.authorAvatarUrl,
      level: ContributorLevel.User,
      firstContributionAt: nowIso,
      lastContributionAt: nowIso,
      prCount: 0,
      issueCount: 0,
    };
    await this.contributors.create(fresh);
    return fresh;
  }

  private async recordFirstPr(contributorId: string, prNumber: number): Promise<RecognitionEvent> {
    const nowIso = new Date().toISOString();
    const event: RecognitionEvent = {
      id: randomUUID(),
      createdAt: nowIso,
      updatedAt: nowIso,
      contributorId,
      kind: RecognitionKind.FirstPR,
      occurredAt: nowIso,
      prNumber,
    };
    await this.events.insert(event);
    return event;
  }
}

function renderWelcomeComment(login: string): string {
  return [
    `Welcome to the project, @${login} 🎉`,
    '',
    'Thanks for opening your first PR here. A few things to know:',
    '- A maintainer will review shortly — feel free to ping if it has been quiet.',
    '- Conventional Commits are enforced (e.g. `feat(scope): subject`).',
    '- `pnpm validate` runs lint + typecheck + tests locally if you want to pre-flight CI.',
    '',
    "We're glad you're here.",
  ].join('\n');
}
