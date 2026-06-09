import type { Meta, StoryObj } from '@storybook/react';
import { NotificationSettingsSection } from './notification-settings-section';

const meta = {
  title: 'Features/Settings/NotificationSettingsSection',
  component: NotificationSettingsSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof NotificationSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const allEvents = {
  agentStarted: true,
  phaseCompleted: true,
  waitingApproval: true,
  agentCompleted: true,
  agentFailed: true,
  mergeReviewReady: true,
  prMerged: true,
  prClosed: true,
  prChecksPassed: true,
  prChecksFailed: true,
  prBlocked: true,
  workflowStarted: true,
  workflowCompleted: true,
  workflowFailed: true,
};

const noEvents = {
  agentStarted: false,
  phaseCompleted: false,
  waitingApproval: false,
  agentCompleted: false,
  agentFailed: false,
  mergeReviewReady: false,
  prMerged: false,
  prClosed: false,
  prChecksPassed: false,
  prChecksFailed: false,
  prBlocked: false,
  workflowStarted: false,
  workflowCompleted: false,
  workflowFailed: false,
};

export const Default: Story = {
  args: {
    notifications: {
      inApp: { enabled: true },
      browser: { enabled: false },
      desktop: { enabled: false },
      events: allEvents,
    },
  },
};

export const AllEnabled: Story = {
  args: {
    notifications: {
      inApp: { enabled: true },
      browser: { enabled: false },
      desktop: { enabled: false },
      events: allEvents,
    },
  },
};

export const AllDisabled: Story = {
  args: {
    notifications: {
      inApp: { enabled: false },
      browser: { enabled: false },
      desktop: { enabled: false },
      events: noEvents,
    },
  },
};
