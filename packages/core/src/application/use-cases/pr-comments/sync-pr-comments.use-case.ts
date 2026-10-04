/**
 * The daemon's PR comment pass (spec 124): for every feature waiting for
 * review with an open pull request, read its comments, then address the
 * pending ones its space's trigger selects (#shep mentions by default). One
 * feature failing does not stop the others.
 */

import { injectable, inject } from 'tsyringe';
import {
  PrCommentStatus,
  PrStatus,
  SdlcLifecycle,
  type Feature,
} from '../../../domain/generated/output.js';
import { isAutoAddressed } from '../../../domain/shared/pr-comments.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { ResolveSpaceEnvironmentUseCase } from '../spaces/resolve-space-environment.use-case.js';
import { AddressPrCommentsUseCase } from './address-pr-comments.use-case.js';
import { FetchPrCommentsUseCase } from './fetch-pr-comments.use-case.js';

export interface PrCommentSyncSummary {
  /** Features whose comments were read. */
  features: number;
  /** New comments stored. */
  added: number;
  /** Rounds run. */
  rounds: number;
  /** "Feature: reason" for each feature that failed. */
  errors: string[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@injectable()
export class SyncPrCommentsUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject(FetchPrCommentsUseCase) private readonly fetch: FetchPrCommentsUseCase,
    @inject(AddressPrCommentsUseCase) private readonly address: AddressPrCommentsUseCase,
    @inject(ResolveSpaceEnvironmentUseCase)
    private readonly spaceEnvironment: ResolveSpaceEnvironmentUseCase
  ) {}

  async runDue(): Promise<PrCommentSyncSummary> {
    const summary: PrCommentSyncSummary = { features: 0, added: 0, rounds: 0, errors: [] };
    const reviewing = (await this.features.list({ lifecycle: SdlcLifecycle.Review })).filter(
      (feature) => feature.pr?.status === PrStatus.Open
    );
    for (const feature of reviewing) {
      try {
        await this.syncFeature(feature, summary);
      } catch (error) {
        summary.errors.push(`${feature.name}: ${message(error)}`);
      }
    }
    return summary;
  }

  private async syncFeature(feature: Feature, summary: PrCommentSyncSummary): Promise<void> {
    const fetched = await this.fetch.execute(feature.id);
    if (!fetched.ok) throw new Error(fetched.error);
    summary.features += 1;
    summary.added += fetched.added;

    const { context } = await this.spaceEnvironment.execute(feature.repositoryPath);
    const trigger = context.space.agentSettings?.prCommentTrigger;
    const commentIds = fetched.comments
      .filter(
        (comment) =>
          comment.status === PrCommentStatus.Pending && isAutoAddressed(trigger, comment.body)
      )
      .map((comment) => comment.id);
    if (commentIds.length === 0) return;

    // A refusal (a round already running, an agent the space disallows) is not an error here.
    const started = await this.address.start({ feature: feature.id, commentIds });
    if (!started.ok) return;
    await this.address.run(started.round.id);
    summary.rounds += 1;
  }
}
