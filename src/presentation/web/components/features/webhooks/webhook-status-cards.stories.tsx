import type { Meta, StoryObj } from '@storybook/react';
import { WebhookStatusCards } from './webhook-status-cards';
import type { WebhookSystemStatus } from './types';

const activeStatus: WebhookSystemStatus = {
  running: true,
  tunnel: {
    connected: true,
    publicUrl: 'https://random-subdomain.trycloudflare.com',
  },
  webhooks: {
    registered: [
      { repoFullName: 'acme/web-app', webhookId: 12345, repositoryPath: '/home/user/web-app' },
      {
        repoFullName: 'acme/api-service',
        webhookId: 12346,
        repositoryPath: '/home/user/api-service',
      },
    ],
    totalDeliveries: 42,
    successCount: 38,
    errorCount: 2,
    ignoredCount: 2,
  },
  startedAt: new Date(Date.now() - 3600000).toISOString(),
};

const inactiveStatus: WebhookSystemStatus = {
  running: false,
  tunnel: { connected: false, publicUrl: null },
  webhooks: {
    registered: [],
    totalDeliveries: 0,
    successCount: 0,
    errorCount: 0,
    ignoredCount: 0,
  },
  startedAt: null,
};

const meta: Meta<typeof WebhookStatusCards> = {
  title: 'Features/Webhooks/WebhookStatusCards',
  component: WebhookStatusCards,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: { status: activeStatus },
};

export const Inactive: Story = {
  args: { status: inactiveStatus },
};

export const TunnelDisconnected: Story = {
  args: {
    status: {
      ...activeStatus,
      tunnel: { connected: false, publicUrl: null },
    },
  },
};
