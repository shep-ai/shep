/**
 * DiscordRecapPublisher — unit tests
 *
 * Delegates to `IOutreachPublisher.publishToDiscord` and translates the
 * result into a `RecapPublishResult`. Asserts that the artifact title +
 * body are concatenated into the Discord message and that the channelId
 * from the target lands at the outreach call.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import { DiscordRecapPublisher } from '@/infrastructure/services/recap/discord-recap-publisher.service.js';
import {
  RecapPublisherError,
  type RecapArtifact,
} from '@/application/ports/output/services/recap-publisher.interface.js';
import type { IOutreachPublisher } from '@/application/ports/output/services/outreach-publisher.interface.js';
import { RecapChannel } from '@/domain/generated/output.js';

function makeArtifact(): RecapArtifact {
  return {
    recapId: '2026-04',
    title: 'April 2026 recap',
    body: '## Highlights\n\n- Shipped a thing.',
    periodStartIso: '2026-04-01T00:00:00.000Z',
  };
}

describe('DiscordRecapPublisher', () => {
  let outreach: IOutreachPublisher;
  let publishMock: Mock;
  let publisher: DiscordRecapPublisher;

  beforeEach(() => {
    publishMock = vi.fn().mockResolvedValue({
      messageId: 'msg-42',
      postedAt: '2026-05-06T12:00:00.000Z',
    });
    outreach = { publishToDiscord: publishMock };
    publisher = new DiscordRecapPublisher(outreach);
  });

  it('forwards the artifact body to IOutreachPublisher and returns a Discord reference', async () => {
    const result = await publisher.publish(makeArtifact(), {
      channel: RecapChannel.Discord,
      channelId: '1234567890',
    });

    expect(publishMock).toHaveBeenCalledOnce();
    const [channelId, body] = publishMock.mock.calls[0]!;
    expect(channelId).toBe('1234567890');
    expect(body).toContain('April 2026 recap');
    expect(body).toContain('## Highlights');
    expect(result.channel).toBe(RecapChannel.Discord);
    expect(result.reference).toBe('msg-42');
  });

  it('throws RecapPublisherError when the channel does not match', async () => {
    await expect(
      publisher.publish(makeArtifact(), { channel: RecapChannel.File })
    ).rejects.toBeInstanceOf(RecapPublisherError);
  });

  it('translates outreach failures into RecapPublisherError', async () => {
    publishMock.mockRejectedValueOnce(new Error('discord api down'));
    await expect(
      publisher.publish(makeArtifact(), {
        channel: RecapChannel.Discord,
        channelId: '1',
      })
    ).rejects.toBeInstanceOf(RecapPublisherError);
  });
});
