/**
 * GithubDiscussionRecapPublisher — unit tests.
 *
 * Verifies that the adapter constructs a discussion-creation request through
 * the injected creator port and returns the resulting discussion URL as the
 * reference.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import {
  GithubDiscussionRecapPublisher,
  type GithubDiscussionCreator,
} from '@/infrastructure/services/recap/github-discussion-recap-publisher.service.js';
import {
  RecapPublisherError,
  type RecapArtifact,
} from '@/application/ports/output/services/recap-publisher.interface.js';
import { RecapChannel } from '@/domain/generated/output.js';

function makeArtifact(): RecapArtifact {
  return {
    recapId: '2026-04',
    title: 'April 2026 recap',
    body: '## Highlights',
    periodStartIso: '2026-04-01T00:00:00.000Z',
  };
}

describe('GithubDiscussionRecapPublisher', () => {
  let creator: Mock;
  let publisher: GithubDiscussionRecapPublisher;

  beforeEach(() => {
    creator = vi.fn().mockResolvedValue({
      url: 'https://github.com/shep-ai/shep/discussions/123',
      number: 123,
    });
    publisher = new GithubDiscussionRecapPublisher(creator as unknown as GithubDiscussionCreator);
  });

  it('forwards artifact title + body to the creator with the target metadata', async () => {
    const result = await publisher.publish(makeArtifact(), {
      channel: RecapChannel.GithubDiscussion,
      owner: 'shep-ai',
      repo: 'shep',
      categorySlug: 'announcements',
    });

    expect(creator).toHaveBeenCalledOnce();
    expect(creator).toHaveBeenCalledWith({
      owner: 'shep-ai',
      repo: 'shep',
      categorySlug: 'announcements',
      title: 'April 2026 recap',
      body: '## Highlights',
    });
    expect(result.channel).toBe(RecapChannel.GithubDiscussion);
    expect(result.reference).toBe('https://github.com/shep-ai/shep/discussions/123');
  });

  it('throws RecapPublisherError when handed a non-discussion target', async () => {
    await expect(
      publisher.publish(makeArtifact(), { channel: RecapChannel.File })
    ).rejects.toBeInstanceOf(RecapPublisherError);
  });

  it('wraps creator failures in RecapPublisherError', async () => {
    creator.mockRejectedValueOnce(new Error('graphql 500'));
    await expect(
      publisher.publish(makeArtifact(), {
        channel: RecapChannel.GithubDiscussion,
        owner: 'o',
        repo: 'r',
        categorySlug: 'c',
      })
    ).rejects.toBeInstanceOf(RecapPublisherError);
  });
});
