import type { Meta, StoryObj } from '@storybook/react';
import { HarnessTaskStatus } from '@shepai/core/domain/generated/output';
import { fixtureSession } from './harness-fixtures';
import { HarnessSessionActions } from './harness-session-actions';

const meta: Meta<typeof HarnessSessionActions> = {
  title: 'Harness/HarnessSessionActions',
  component: HarnessSessionActions,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessSessionActions>;

/** Finished: apply to a branch, promote to a feature, or discard. */
export const Finished: Story = {
  args: { session: fixtureSession, latestTaskStatus: HarnessTaskStatus.Completed },
};

/** Running: only Stop is offered. */
export const Running: Story = {
  args: { session: fixtureSession, latestTaskStatus: HarnessTaskStatus.Running },
};
