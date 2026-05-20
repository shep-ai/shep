/**
 * DiscordRecapPublisher
 *
 * Recap publisher backed by the existing `IOutreachPublisher` port. Lets
 * the recap pipeline reuse Discord transport, auth, and redaction without
 * knowing about the Discord REST API itself — the outreach port owns
 * channel-specific concerns.
 */

import { RecapChannel } from '../../../domain/generated/output.js';
import type { IOutreachPublisher } from '../../../application/ports/output/services/outreach-publisher.interface.js';
import {
  RecapPublisherError,
  type IRecapPublisher,
  type RecapArtifact,
  type RecapPublishResult,
  type RecapTarget,
} from '../../../application/ports/output/services/recap-publisher.interface.js';

function buildBody(artifact: RecapArtifact): string {
  return `**${artifact.title}**\n\n${artifact.body}`;
}

export class DiscordRecapPublisher implements IRecapPublisher {
  readonly channel = RecapChannel.Discord;

  constructor(private readonly outreach: IOutreachPublisher) {}

  async publish(artifact: RecapArtifact, target: RecapTarget): Promise<RecapPublishResult> {
    if (target.channel !== RecapChannel.Discord) {
      throw new RecapPublisherError(
        `DiscordRecapPublisher cannot handle channel ${target.channel}`,
        this.channel
      );
    }
    try {
      const result = await this.outreach.publishToDiscord(target.channelId, buildBody(artifact));
      return { channel: this.channel, reference: result.messageId };
    } catch (err) {
      throw new RecapPublisherError(
        `Failed to publish recap ${artifact.recapId} to Discord`,
        this.channel,
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }
}
