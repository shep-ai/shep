import type { Meta, StoryObj } from '@storybook/react';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';

import { StatusPill } from './status-pill';

const meta: Meta<typeof StatusPill> = {
  title: 'ApplicationPage/StatusPill',
  component: StatusPill,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof StatusPill>;

export const Idle: Story = {
  args: {
    applicationId: 'app-001',
    persistedStatus: ApplicationStatus.Idle,
    deployReady: false,
  },
};

export const Live: Story = {
  args: {
    applicationId: 'app-001',
    persistedStatus: ApplicationStatus.Idle,
    deployReady: true,
  },
};
