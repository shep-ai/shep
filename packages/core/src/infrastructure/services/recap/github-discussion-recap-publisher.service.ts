/**
 * GithubDiscussionRecapPublisher
 *
 * Publishes a recap as a GitHub Discussion. Discussions are GraphQL-only on
 * GitHub's REST surface; this adapter takes a `GithubDiscussionCreator`
 * function so the GraphQL call site stays injectable + testable. The
 * default factory uses `gh api graphql` so we reuse the same `gh`-resolved
 * token everything else uses (NFR-10).
 */

import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';
import { injectable } from 'tsyringe';

import { RecapChannel } from '../../../domain/generated/output.js';
import {
  RecapPublisherError,
  type IRecapPublisher,
  type RecapArtifact,
  type RecapPublishResult,
  type RecapTarget,
} from '../../../application/ports/output/services/recap-publisher.interface.js';

export interface GithubDiscussionCreatorInput {
  owner: string;
  repo: string;
  categorySlug: string;
  title: string;
  body: string;
}

export interface GithubDiscussionCreatorResult {
  url: string;
  number: number;
}

export type GithubDiscussionCreator = (
  input: GithubDiscussionCreatorInput
) => Promise<GithubDiscussionCreatorResult>;

const GRAPHQL_QUERY = `
query($owner: String!, $repo: String!, $slug: String!) {
  repository(owner: $owner, name: $repo) {
    id
    discussionCategory(slug: $slug) { id }
  }
}`;

const GRAPHQL_MUTATION = `
mutation($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repoId, categoryId: $catId, title: $title, body: $body}) {
    discussion { url number }
  }
}`;

/**
 * Default creator — drives the GraphQL endpoint via `gh api graphql`. Reuses
 * the user's existing `gh auth` credentials.
 */
export const defaultGithubDiscussionCreator: GithubDiscussionCreator = async (input) => {
  const execFile = promisify(execFileCb);
  const lookup = await execFile('gh', [
    'api',
    'graphql',
    '-F',
    `owner=${input.owner}`,
    '-F',
    `repo=${input.repo}`,
    '-F',
    `slug=${input.categorySlug}`,
    '-f',
    `query=${GRAPHQL_QUERY}`,
  ]);
  const lookupJson = JSON.parse(lookup.stdout) as {
    data: { repository: { id: string; discussionCategory: { id: string } | null } };
  };
  const repo = lookupJson.data.repository;
  if (!repo?.discussionCategory) {
    throw new Error(
      `Discussion category "${input.categorySlug}" not found on ${input.owner}/${input.repo}`
    );
  }

  const create = await execFile('gh', [
    'api',
    'graphql',
    '-F',
    `repoId=${repo.id}`,
    '-F',
    `catId=${repo.discussionCategory.id}`,
    '-F',
    `title=${input.title}`,
    '-F',
    `body=${input.body}`,
    '-f',
    `query=${GRAPHQL_MUTATION}`,
  ]);
  const createJson = JSON.parse(create.stdout) as {
    data: { createDiscussion: { discussion: { url: string; number: number } } };
  };
  return createJson.data.createDiscussion.discussion;
};

@injectable()
export class GithubDiscussionRecapPublisher implements IRecapPublisher {
  readonly channel = RecapChannel.GithubDiscussion;

  constructor(private readonly creator: GithubDiscussionCreator = defaultGithubDiscussionCreator) {}

  async publish(artifact: RecapArtifact, target: RecapTarget): Promise<RecapPublishResult> {
    if (target.channel !== RecapChannel.GithubDiscussion) {
      throw new RecapPublisherError(
        `GithubDiscussionRecapPublisher cannot handle channel ${target.channel}`,
        this.channel
      );
    }
    try {
      const created = await this.creator({
        owner: target.owner,
        repo: target.repo,
        categorySlug: target.categorySlug,
        title: artifact.title,
        body: artifact.body,
      });
      return { channel: this.channel, reference: created.url };
    } catch (err) {
      throw new RecapPublisherError(
        `Failed to create GitHub Discussion for recap ${artifact.recapId}`,
        this.channel,
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }
}
