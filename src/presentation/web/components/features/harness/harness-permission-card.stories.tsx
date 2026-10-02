import type { Meta, StoryObj } from '@storybook/react';
import { GrantScope, HarnessSessionOrigin } from '@shepai/core/domain/generated/output';
import { fixturePermission, fixturePermissionItem, fixtureSession } from './harness-fixtures';
import { HarnessPermissionCard } from './harness-permission-card';

const meta: Meta<typeof HarnessPermissionCard> = {
  title: 'Harness/HarnessPermissionCard',
  component: HarnessPermissionCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessPermissionCard>;

/** A feature run asks to add a dependency: once / this phase / this feature. */
export const FeatureRun: Story = { args: { item: fixturePermissionItem } };

/** Standalone runs offer once / this session. */
export const Standalone: Story = {
  args: {
    item: {
      ...fixturePermissionItem,
      session: { ...fixtureSession, origin: HarnessSessionOrigin.Standalone },
      scopes: [GrantScope.Once, GrantScope.Session],
    },
  },
};

/** A hard deny is shown, never offered as approvable. */
export const HardDeny: Story = {
  args: {
    item: {
      ...fixturePermissionItem,
      approvable: false,
      decision: {
        ...fixturePermission,
        hard: true,
        matchedRuleIds: ['deny-secret-files'],
        action: { ...fixturePermission.action, summary: 'read_file .env' },
        effects: [],
      },
    },
  },
};
