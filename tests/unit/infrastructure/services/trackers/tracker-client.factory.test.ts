import { describe, it, expect } from 'vitest';
import { TrackerClientFactory } from '@/infrastructure/services/trackers/tracker-client.factory.js';
import { LinearTrackerClient } from '@/infrastructure/services/trackers/linear-tracker.client.js';
import { JiraTrackerClient } from '@/infrastructure/services/trackers/jira-tracker.client.js';
import { ConnectionProvider } from '@/domain/generated/output.js';

describe('TrackerClientFactory', () => {
  const factory = new TrackerClientFactory();

  it('builds a Linear client', () => {
    expect(factory.create({ provider: ConnectionProvider.Linear, secret: 'k' })).toBeInstanceOf(
      LinearTrackerClient
    );
  });

  it('builds a Jira client from site, email and token', () => {
    expect(
      factory.create({
        provider: ConnectionProvider.Jira,
        siteUrl: 'https://a.atlassian.net',
        accountEmail: 'a@b.c',
        secret: 't',
      })
    ).toBeInstanceOf(JiraTrackerClient);
  });

  it('refuses a Jira client without site or email', () => {
    expect(() => factory.create({ provider: ConnectionProvider.Jira, secret: 't' })).toThrow(
      'site URL and account email'
    );
  });
});
