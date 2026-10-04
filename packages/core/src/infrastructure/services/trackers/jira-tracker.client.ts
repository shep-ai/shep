/**
 * Jira Cloud tracker client (spec 122): REST API v3 over an injected fetch,
 * authenticated with an account email and API token.
 *
 * "Updated since" is expressed as relative minutes (`updated >= "-62m"`)
 * because absolute JQL dates are read in the Jira user's profile time zone,
 * which shep cannot know. Descriptions convert between ADF and Markdown.
 */

import type { ExternalIssue } from '../../../domain/generated/output.js';
import type { ConnectionAccount } from '../../../application/ports/output/services/connection-verifier.interface.js';
import {
  jiraPriority,
  jiraStateGroup,
  priorityToJiraName,
} from '../../../domain/shared/tracker-sync.js';
import {
  TrackerStatusUnavailableError,
  type ITrackerClient,
  type TrackerIssueChanges,
  type TrackerIssuePage,
} from '../../../application/ports/output/services/tracker-client.interface.js';
import { adfToMarkdown, markdownToAdf } from './adf.js';
import { httpFailure, sendJson, type FetchFunction } from '../connections/connection-http.js';

const LABEL = 'Jira';
const PAGE_SIZE = 100;
const SEARCH_FIELDS = ['summary', 'description', 'status', 'priority', 'updated'];
/** Extra minutes searched before the cursor, covering clock skew between shep and Jira. */
const CURSOR_OVERLAP_MINUTES = 2;
const MS_PER_MINUTE = 60_000;
/** A trailing ORDER BY in a user's JQL; the sync supplies its own ordering. */
const ORDER_BY = /\border\s+by\b[\s\S]*$/i;

export interface JiraClientConfig {
  siteUrl: string;
  accountEmail: string;
  secret: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    status: { name: string; statusCategory: { key: string } };
    priority?: { name: string } | null;
    updated: string;
  };
}

interface JiraTransition {
  id: string;
  to: { name: string; statusCategory: { key: string } };
}

export class JiraTrackerClient implements ITrackerClient {
  private readonly site: string;
  private readonly authorization: string;

  constructor(
    config: JiraClientConfig,
    private readonly fetchFn: FetchFunction = fetch,
    private readonly now: () => Date = () => new Date()
  ) {
    this.site = config.siteUrl.trim().replace(/\/+$/, '');
    const credentials = Buffer.from(`${config.accountEmail}:${config.secret}`).toString('base64');
    this.authorization = `Basic ${credentials}`;
  }

  async testConnection(): Promise<ConnectionAccount> {
    const me = await this.request<{ displayName: string }>('GET', '/myself');
    return { name: me.displayName };
  }

  async searchUpdatedSince(
    scope: string,
    since: Date | undefined,
    page?: string
  ): Promise<TrackerIssuePage> {
    const base = `(${scope.replace(ORDER_BY, '').trim()})`;
    const window = since
      ? ` AND updated >= "-${Math.ceil((this.now().getTime() - since.getTime()) / MS_PER_MINUTE) + CURSOR_OVERLAP_MINUTES}m"`
      : '';
    const result = await this.request<{ issues: JiraIssue[]; nextPageToken?: string }>(
      'POST',
      '/search/jql',
      {
        jql: `${base}${window} ORDER BY updated ASC`,
        fields: SEARCH_FIELDS,
        maxResults: PAGE_SIZE,
        ...(page ? { nextPageToken: page } : {}),
      }
    );
    return {
      issues: result.issues.map((issue) => this.toExternalIssue(issue)),
      ...(result.nextPageToken ? { nextPage: result.nextPageToken } : {}),
    };
  }

  async updateIssue(
    _scope: string,
    externalId: string,
    changes: TrackerIssueChanges
  ): Promise<void> {
    const fields: Record<string, unknown> = {};
    if (changes.title !== undefined) fields.summary = changes.title;
    if (changes.description !== undefined) fields.description = markdownToAdf(changes.description);
    if (changes.priority !== undefined) {
      const name = priorityToJiraName(changes.priority);
      if (name) fields.priority = { name };
    }
    if (Object.keys(fields).length > 0) {
      await this.request('PUT', `/issue/${encodeURIComponent(externalId)}`, { fields });
    }

    if (changes.stateGroup !== undefined) {
      const path = `/issue/${encodeURIComponent(externalId)}/transitions`;
      const { transitions } = await this.request<{ transitions: JiraTransition[] }>('GET', path);
      const transition = transitions.find(
        (candidate) =>
          jiraStateGroup(candidate.to.statusCategory.key, candidate.to.name) === changes.stateGroup
      );
      if (!transition) {
        throw new TrackerStatusUnavailableError(
          `${LABEL}: no transition from the current status of ${externalId} reaches ${changes.stateGroup}`
        );
      }
      await this.request('POST', path, { transition: { id: transition.id } });
    }
  }

  private toExternalIssue(issue: JiraIssue): ExternalIssue {
    const description = adfToMarkdown(issue.fields.description);
    return {
      externalId: issue.id,
      key: issue.key,
      url: `${this.site}/browse/${issue.key}`,
      title: issue.fields.summary,
      ...(description ? { description } : {}),
      stateGroup: jiraStateGroup(issue.fields.status.statusCategory.key, issue.fields.status.name),
      stateName: issue.fields.status.name,
      priority: jiraPriority(issue.fields.priority?.name),
      updatedAt: new Date(issue.fields.updated),
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { response, body: payload } = await sendJson(
      this.fetchFn,
      `${this.site}/rest/api/3${path}`,
      {
        method,
        headers: {
          Authorization: this.authorization,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }
    );
    if (!response.ok) {
      const details = payload as { errorMessages?: string[]; errors?: Record<string, string> };
      const detail = [
        ...(details?.errorMessages ?? []),
        ...Object.values(details?.errors ?? {}),
      ].join('; ');
      throw httpFailure(LABEL, response, detail);
    }
    return payload as T;
  }
}
