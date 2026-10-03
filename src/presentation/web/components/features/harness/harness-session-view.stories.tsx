import type { Meta, StoryObj } from '@storybook/react';
import { fixturePermissionItem, fixtureSessionDetail } from './harness-fixtures';
import { HarnessSessionView } from './harness-session-view';

const meta: Meta<typeof HarnessSessionView> = {
  title: 'Harness/HarnessSessionView',
  component: HarnessSessionView,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessSessionView>;

/** A finished standalone session. */
export const Default: Story = { args: { detail: fixtureSessionDetail } };

/** A session blocked on an approval: the prompt comes first. */
export const WaitingForApproval: Story = {
  args: { detail: { ...fixtureSessionDetail, pendingPermissions: [fixturePermissionItem] } },
};
