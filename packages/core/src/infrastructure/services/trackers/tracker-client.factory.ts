/** Builds the tracker client for a connection's provider (spec 122). */

import { ConnectionProvider } from '../../../domain/generated/output.js';
import {
  TrackerRequestError,
  type ITrackerClient,
  type ITrackerClientFactory,
  type TrackerClientConfig,
} from '../../../application/ports/output/services/tracker-client.interface.js';
import { JiraTrackerClient } from './jira-tracker.client.js';
import { LinearTrackerClient } from './linear-tracker.client.js';
import type { FetchFunction } from './tracker-http.js';

export class TrackerClientFactory implements ITrackerClientFactory {
  constructor(private readonly fetchFn: FetchFunction = fetch) {}

  create(config: TrackerClientConfig): ITrackerClient {
    switch (config.provider) {
      case ConnectionProvider.Linear:
        return new LinearTrackerClient(config.secret, this.fetchFn);
      case ConnectionProvider.Jira:
        if (!config.siteUrl || !config.accountEmail) {
          throw new TrackerRequestError('A Jira client needs the site URL and account email.');
        }
        return new JiraTrackerClient(
          { siteUrl: config.siteUrl, accountEmail: config.accountEmail, secret: config.secret },
          this.fetchFn
        );
    }
  }
}
