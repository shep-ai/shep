import type { Meta, StoryObj } from '@storybook/react';
import {
  fixtureCapabilities,
  fixturePermissionItem,
  fixturePolicies,
  fixtureSessionList,
} from './harness-fixtures';
import { HarnessPageClient } from './harness-page-client';

const meta: Meta<typeof HarnessPageClient> = {
  title: 'Harness/HarnessPageClient',
  component: HarnessPageClient,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessPageClient>;

/** /harness with sessions, one approval waiting, catalog and setup. */
export const Default: Story = {
  args: {
    sessions: fixtureSessionList,
    approvals: [fixturePermissionItem],
    capabilities: fixtureCapabilities,
    policies: fixturePolicies,
    repositories: ['/home/dev/acme-api'],
  },
};

/** A fresh install: nothing run yet. */
export const Empty: Story = {
  args: {
    sessions: [],
    approvals: [],
    capabilities: fixtureCapabilities,
    policies: fixturePolicies,
    repositories: [],
  },
};
