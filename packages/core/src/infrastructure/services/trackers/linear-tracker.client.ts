/**
 * Linear tracker client (spec 122): GraphQL over an injected fetch,
 * authenticated with a personal API key.
 */

import type { ExternalIssue } from '../../../domain/generated/output.js';
import {
  LINEAR_STATE_TYPE_FOR_GROUP,
  linearPriority,
  linearStateGroup,
  priorityToLinear,
} from '../../../domain/shared/tracker-sync.js';
import {
  TrackerRateLimitError,
  TrackerRequestError,
  TrackerStatusUnavailableError,
  type ITrackerClient,
  type TrackerAccount,
  type TrackerIssueChanges,
  type TrackerIssuePage,
} from '../../../application/ports/output/services/tracker-client.interface.js';
import { httpFailure, retryAfterMs, sendJson, type FetchFunction } from './tracker-http.js';

export const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LABEL = 'Linear';
const PAGE_SIZE = 50;
const RATE_LIMITED = 'RATELIMITED';

const VIEWER = `query Viewer { viewer { name email } }`;

const ISSUES = `query Issues($filter: IssueFilter, $after: String) {
  issues(filter: $filter, first: ${PAGE_SIZE}, after: $after, orderBy: updatedAt) {
    nodes {
      id identifier url title description priority updatedAt
      state { name type }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const STATES = `query States($team: String!, $type: String!) {
  workflowStates(filter: { team: { key: { eq: $team } }, type: { eq: $type } }) {
    nodes { id type position }
  }
}`;

const UPDATE = `mutation Update($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;

interface LinearIssueNode {
  id: string;
  identifier: string;
  url: string;
  title: string;
  description?: string | null;
  priority: number;
  updatedAt: string;
  state: { name: string; type: string };
}

interface GraphQlError {
  message: string;
  extensions?: { code?: string; type?: string };
}

export class LinearTrackerClient implements ITrackerClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFunction = fetch
  ) {}

  async testConnection(): Promise<TrackerAccount> {
    const data = await this.query<{ viewer: { name: string } }>(VIEWER, {});
    return { name: data.viewer.name };
  }

  async searchUpdatedSince(
    scope: string,
    since: Date | undefined,
    page?: string
  ): Promise<TrackerIssuePage> {
    const filter = {
      team: { key: { eq: scope.trim() } },
      ...(since ? { updatedAt: { gt: since.toISOString() } } : {}),
    };
    const data = await this.query<{
      issues: {
        nodes: LinearIssueNode[];
        pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      };
    }>(ISSUES, { ...(page ? { after: page } : {}), filter });
    const { nodes, pageInfo } = data.issues;
    return {
      issues: nodes.map(toExternalIssue),
      ...(pageInfo.hasNextPage && pageInfo.endCursor ? { nextPage: pageInfo.endCursor } : {}),
    };
  }

  async updateIssue(
    scope: string,
    externalId: string,
    changes: TrackerIssueChanges
  ): Promise<void> {
    const input: Record<string, unknown> = {};
    if (changes.title !== undefined) input.title = changes.title;
    if (changes.description !== undefined) input.description = changes.description;
    if (changes.priority !== undefined) input.priority = priorityToLinear(changes.priority);
    if (changes.stateGroup !== undefined) {
      const type = LINEAR_STATE_TYPE_FOR_GROUP[changes.stateGroup];
      const data = await this.query<{
        workflowStates: { nodes: { id: string; position: number }[] };
      }>(STATES, { team: scope.trim(), type });
      const [first] = [...data.workflowStates.nodes].sort((a, b) => a.position - b.position);
      if (!first) {
        throw new TrackerStatusUnavailableError(
          `${LABEL}: team ${scope} has no "${type}" workflow state for ${changes.stateGroup}`
        );
      }
      input.stateId = first.id;
    }
    if (Object.keys(input).length === 0) return;
    await this.query(UPDATE, { id: externalId, input });
  }

  private async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const { response, body } = await sendJson(this.fetchFn, LINEAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.apiKey },
      body: JSON.stringify({ query, variables }),
    });
    const payload = (body ?? {}) as { data?: T; errors?: GraphQlError[] };
    const errors = payload.errors ?? [];
    if (errors.some((error) => error.extensions?.code === RATE_LIMITED)) {
      throw new TrackerRateLimitError(`${LABEL}: rate limited`, retryAfterMs(response.headers));
    }
    const detail = errors.map((error) => error.message).join('; ');
    if (!response.ok) throw httpFailure(LABEL, response, detail);
    if (errors.length > 0 || payload.data === undefined) {
      throw new TrackerRequestError(`${LABEL}: ${detail || 'empty response'}`, response.status);
    }
    return payload.data;
  }
}

function toExternalIssue(node: LinearIssueNode): ExternalIssue {
  return {
    externalId: node.id,
    key: node.identifier,
    url: node.url,
    title: node.title,
    ...(node.description ? { description: node.description } : {}),
    stateGroup: linearStateGroup(node.state.type),
    stateName: node.state.name,
    priority: linearPriority(node.priority),
    updatedAt: new Date(node.updatedAt),
  };
}
