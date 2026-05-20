/**
 * PublishMonthlyRecapUseCase — spec 097, FR-32 / NFR-5.
 *
 * Fans a `RecapArtifact` out across the configured `IRecapPublisher`
 * adapters via `Promise.allSettled`. Each channel is individually gated
 * through `IContributorActionGate`, so a single denial never blocks the
 * other channels and a single failure does not poison the run.
 *
 * Returns a per-channel status map so the caller can surface partial
 * progress (e.g. "file ✓, discord ✓, github-discussion ⚠ rate-limited").
 */

import { inject, injectable, injectAll } from 'tsyringe';

import { RecapChannel } from '../../../domain/generated/output.js';
import type {
  IContributorActionGate,
  ContributorActionKind,
} from '../../ports/output/services/contributor-action-gate.interface.js';
import type {
  IRecapPublisher,
  RecapArtifact,
  RecapTarget,
} from '../../ports/output/services/recap-publisher.interface.js';

/**
 * Recap artifact and per-channel destinations requested for publication.
 */
export interface PublishMonthlyRecapInput {
  /** Rendered monthly recap to publish. */
  artifact: RecapArtifact;
  /** Per-channel target descriptors. Channels missing here are skipped. */
  targets: readonly RecapTarget[];
}

/**
 * Per-channel publication outcome returned after gating and publisher execution.
 */
export type ChannelOutcome =
  | {
      /** Channel whose publisher completed successfully. */
      channel: RecapChannel;
      /** Terminal status indicating the publisher returned a reference. */
      status: 'published';
      /** Channel-specific identifier or URL returned by the publisher. */
      reference: string;
    }
  | {
      /** Channel blocked by `IContributorActionGate`. */
      channel: RecapChannel;
      /** Terminal status indicating supervisor gating denied publication. */
      status: 'denied';
      /** Human-readable reason returned by the gate. */
      rationale: string;
    }
  | {
      /** Channel whose publisher or gate threw unexpectedly. */
      channel: RecapChannel;
      /** Terminal status indicating publication failed after being attempted. */
      status: 'failed';
      /** Error message normalized from the thrown reason. */
      error: string;
    }
  | {
      /** Channel with no registered publisher implementation. */
      channel: RecapChannel;
      /** Terminal status indicating no publication attempt was made. */
      status: 'skipped';
      /** Human-readable reason the target was skipped. */
      reason: string;
    };

/**
 * Aggregate publication result preserving one outcome per requested target.
 */
export interface PublishMonthlyRecapResult {
  /** Outcomes ordered to match the requested targets. */
  outcomes: readonly ChannelOutcome[];
}

const CHANNEL_GATE_KINDS: Readonly<Record<RecapChannel, ContributorActionKind>> = {
  [RecapChannel.File]: 'recap-publish-file',
  [RecapChannel.Discord]: 'recap-publish-discord',
  [RecapChannel.GithubDiscussion]: 'recap-publish-github-discussion',
};

@injectable()
export class PublishMonthlyRecapUseCase {
  constructor(
    @inject('IContributorActionGate')
    private readonly gate: IContributorActionGate,
    @injectAll('IRecapPublisher')
    private readonly publishers: readonly IRecapPublisher[]
  ) {}

  async execute(input: PublishMonthlyRecapInput): Promise<PublishMonthlyRecapResult> {
    const settled = await Promise.allSettled(
      input.targets.map((target) => this.runChannel(input.artifact, target))
    );

    const outcomes: ChannelOutcome[] = settled.map((result, idx) => {
      const target = input.targets[idx];
      if (result.status === 'fulfilled') return result.value;
      return {
        channel: target.channel,
        status: 'failed',
        error: errorMessage(result.reason),
      };
    });

    return { outcomes };
  }

  private async runChannel(artifact: RecapArtifact, target: RecapTarget): Promise<ChannelOutcome> {
    const publisher = this.publishers.find((p) => p.channel === target.channel);
    if (!publisher) {
      return {
        channel: target.channel,
        status: 'skipped',
        reason: `No publisher registered for channel ${target.channel}`,
      };
    }

    const decision = await this.gate.gate({
      kind: CHANNEL_GATE_KINDS[target.channel],
      summary: `Publish recap "${artifact.title}" to ${target.channel}`,
      context: { recapId: artifact.recapId, channel: target.channel },
    });
    if (!decision.approved) {
      return { channel: target.channel, status: 'denied', rationale: decision.rationale };
    }

    const result = await publisher.publish(artifact, target);
    return { channel: target.channel, status: 'published', reference: result.reference };
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}
