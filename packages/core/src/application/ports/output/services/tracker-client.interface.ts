/**
 * Tracker client port (spec 122): what the sync needs from Linear or Jira,
 * whichever it is. Implementations live in infrastructure/services/trackers.
 */

import type {
  ExternalIssue,
  Priority,
  StateGroup,
  TrackerProvider,
} from '../../../../domain/generated/output.js';

/** Everything needed to talk to one tracker account. */
export interface TrackerClientConfig {
  provider: TrackerProvider;
  /** Jira site URL; unset for Linear. */
  siteUrl?: string;
  /** Jira account email; unset for Linear. */
  accountEmail?: string;
  /** Linear API key or Jira API token. */
  secret: string;
}

export interface TrackerAccount {
  /** Display name of the account the credentials belong to. */
  name: string;
}

export interface TrackerIssuePage {
  issues: ExternalIssue[];
  /** Pass back to get the next page; absent on the last page. */
  nextPage?: string;
}

/** Fields to change on a tracker issue. */
export interface TrackerIssueChanges {
  title?: string;
  description?: string;
  stateGroup?: StateGroup;
  priority?: Priority;
}

export interface ITrackerClient {
  /** Checks the credentials and names the account. */
  testConnection(): Promise<TrackerAccount>;
  /**
   * One page of the issues in `scope` (Linear team key or Jira JQL) updated
   * after `since` (every issue when unset).
   */
  searchUpdatedSince(
    scope: string,
    since: Date | undefined,
    page?: string
  ): Promise<TrackerIssuePage>;
  /** Writes the changes; a status goes through the tracker's own workflow. */
  updateIssue(scope: string, externalId: string, changes: TrackerIssueChanges): Promise<void>;
}

export interface ITrackerClientFactory {
  create(config: TrackerClientConfig): ITrackerClient;
}

/** The tracker rejected the credentials. */
export class TrackerAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackerAuthError';
  }
}

/** The tracker asked shep to slow down. */
export class TrackerRateLimitError extends Error {
  constructor(
    message: string,
    /** How long the tracker asked to wait, when it said. */
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'TrackerRateLimitError';
  }
}

/** The tracker has no state or transition for a requested status group. */
export class TrackerStatusUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackerStatusUnavailableError';
  }
}

/** Any other failed request. */
export class TrackerRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'TrackerRequestError';
  }
}
