/** Builds the tracker client for a connection's provider (spec 122). */

import { ConnectionProvider } from '../../../domain/generated/output.js';
import {
  type ITrackerClient,
  type ITrackerClientFactory,
} from '../../../application/ports/output/services/tracker-client.interface.js';
import type { ConnectionCredentials } from '../../../application/ports/output/services/connection-verifier.interface.js';
import { ConnectionRequestError } from '../../../application/ports/output/services/connection-errors.js';
import { JiraTrackerClient } from './jira-tracker.client.js';
import { LinearTrackerClient } from './linear-tracker.client.js';
import type { FetchFunction } from '../connections/connection-http.js';

export class TrackerClientFactory implements ITrackerClientFactory {
  constructor(private readonly fetchFn: FetchFunction = fetch) {}

  create(config: ConnectionCredentials): ITrackerClient {
    switch (config.provider) {
      case ConnectionProvider.Linear:
        return new LinearTrackerClient(config.secret, this.fetchFn);
      case ConnectionProvider.Jira:
        if (!config.siteUrl || !config.accountEmail) {
          throw new ConnectionRequestError('A Jira client needs the site URL and account email.');
        }
        return new JiraTrackerClient(
          { siteUrl: config.siteUrl, accountEmail: config.accountEmail, secret: config.secret },
          this.fetchFn
        );
      case ConnectionProvider.Notion:
        throw new ConnectionRequestError(`${config.provider} is not an issue tracker.`);
    }
  }
}
