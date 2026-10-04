/** Sample connections data for the Connections stories. */

import {
  ConnectionStatus,
  ConnectionProvider,
  TrackerSyncDirection,
} from '@shepai/core/domain/generated/output';
import type { TrackerOverview } from '@shepai/core/application/use-cases/trackers/get-tracker-overview.use-case';
import type { TrackerSyncRuleView } from '@shepai/core/application/use-cases/trackers/manage-tracker-sync-rules.use-case';
import type { RunTrackerAction } from './trackers-types';
import { NOTION_OVERVIEW, PRODUCT_LINES } from '../knowledge/knowledge-fixtures';

const T = new Date('2026-10-01T10:00:00Z');

export const SPACES = [
  { id: 'space-personal', name: 'Personal' },
  { id: 'space-acme', name: 'Acme' },
];

export const PROJECTS = [
  { id: 'project-pay', name: 'Payments', slug: 'pay' },
  { id: 'project-web', name: 'Web', slug: 'web' },
];

export const JIRA_RULE: TrackerSyncRuleView = {
  rule: {
    id: 'rule-jira',
    connectionId: 'conn-jira',
    projectId: 'project-pay',
    scope: 'project = PAY AND type = Bug',
    direction: TrackerSyncDirection.TwoWay,
    intervalMinutes: 15,
    enabled: true,
    lastRunAt: T,
    lastRun: { created: 4, updated: 2, pushed: 1, conflicts: 0, failed: 0, rateLimited: false },
    createdAt: T,
    updatedAt: T,
  },
  connection: { name: 'Acme Jira', slug: 'acme-jira', provider: ConnectionProvider.Jira },
  project: { name: 'Payments', slug: 'pay' },
};

export const FAILING_RULE: TrackerSyncRuleView = {
  ...JIRA_RULE,
  rule: {
    ...JIRA_RULE.rule,
    id: 'rule-limited',
    scope: 'project = OPS',
    direction: TrackerSyncDirection.Import,
    enabled: false,
    lastError: 'Jira: rate limited',
  },
};

export const OVERVIEW: TrackerOverview = {
  connections: [
    {
      connection: {
        id: 'conn-jira',
        provider: ConnectionProvider.Jira,
        name: 'Acme Jira',
        slug: 'acme-jira',
        spaceId: 'space-acme',
        siteUrl: 'https://acme.atlassian.net',
        accountEmail: 'dev@acme.com',
        accountName: 'Dev',
        status: ConnectionStatus.Connected,
        createdAt: T,
        updatedAt: T,
      },
      spaceName: 'Acme',
      rules: [JIRA_RULE, FAILING_RULE],
      sources: [],
    },
    {
      connection: {
        id: 'conn-linear',
        provider: ConnectionProvider.Linear,
        name: 'Side projects',
        slug: 'side-projects',
        spaceId: 'space-personal',
        status: ConnectionStatus.Error,
        lastError: 'Linear: Authentication required, not authenticated',
        createdAt: T,
        updatedAt: T,
      },
      spaceName: 'Personal',
      rules: [],
      sources: [],
    },
    NOTION_OVERVIEW,
  ],
  spaces: SPACES,
  productLines: PRODUCT_LINES,
  projects: PROJECTS,
};

/** A RunTrackerAction for stories: runs the (mocked) action and reports success. */
export const runInStory: RunTrackerAction = async (action) => (await action()).ok;
